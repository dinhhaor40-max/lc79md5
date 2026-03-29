const BIN_ID = process.env.JSONBIN_PREDICT_ID;
const API_KEY = process.env.JSONBIN_KEY;
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const SOURCE_API = 'https://lc79-server-production.up.railway.app/api/lichsu';

async function getBin() {
  const res = await fetch(BIN_URL + '/latest', {
    headers: { 'X-Master-Key': API_KEY }
  });
  const data = await res.json();
  return data.record || { history: [], pendingId: null, pendingPredict: null };
}

async function saveBin(data) {
  await fetch(BIN_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
    body: JSON.stringify(data)
  });
}

function toTX(ketQua) {
  return ketQua === 'Tài' ? 'TAI' : 'XIU';
}

function predictBridge(arr) {
  if (arr.length < 4) return null;
  if (arr[0] === arr[1] && arr[1] === arr[2]) return { predict: arr[0], name: 'Cầu Bệt' };
  if (arr[0] !== arr[1] && arr[1] !== arr[2] && arr[2] !== arr[3]) return { predict: arr[0] === 'TAI' ? 'XIU' : 'TAI', name: 'Cầu 1-1' };
  if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) return { predict: arr[0] === 'TAI' ? 'XIU' : 'TAI', name: 'Cầu 2-2' };
  return null;
}

function predictDiceMath(list) {
  if (list.length < 10) return { predict: null, accuracy: 0 };
  let bestAcc = 0, bestRule = null;
  const formulas = [
    d => d[0] + d[1] + d[2],
    d => Math.abs(d[0] - d[1]) + d[2],
    d => d[0] * d[1] + d[2],
    d => d[0] * d[1] * d[2]
  ];
  const rules = [
    v => v % 2 === 0 ? 'TAI' : 'XIU',
    v => v % 2 !== 0 ? 'TAI' : 'XIU',
    v => v > 10 ? 'TAI' : 'XIU',
    v => v <= 10 ? 'TAI' : 'XIU'
  ];
  for (let f of formulas) {
    for (let r of rules) {
      let correct = 0, total = 0;
      for (let i = 1; i < list.length; i++) {
        total++;
        if (r(f([list[i].Xuc_xac_1, list[i].Xuc_xac_2, list[i].Xuc_xac_3])) === toTX(list[i - 1].Ket_qua)) correct++;
      }
      if (total > 0 && correct / total > bestAcc) { bestAcc = correct / total; bestRule = { f, r }; }
    }
  }
  if (bestAcc < 0.55 || !bestRule) return { predict: null, accuracy: bestAcc };
  const first = list[0];
  return { predict: bestRule.r(bestRule.f([first.Xuc_xac_1, first.Xuc_xac_2, first.Xuc_xac_3])), accuracy: bestAcc, name: 'Math ML' };
}

function predictNGram(arr) {
  const tai = arr.filter(x => x === 'TAI').length;
  const xiu = arr.filter(x => x === 'XIU').length;
  return tai > xiu ? 'TAI' : xiu > tai ? 'XIU' : arr[0];
}

function runEnsemble(list, historyRecords) {
  if (list.length < 4) return { predict: 'TAI', confidence: 50, algo: 'Khởi tạo', isReversing: false };
  const txArr = list.map(x => toTX(x.Ket_qua));
  const votes = { TAI: 0, XIU: 0 };
  const algos = [];

  const bridge = predictBridge(txArr);
  if (bridge) { votes[bridge.predict] += 1.5; algos.push(bridge.name); }

  const math = predictDiceMath(list);
  if (math.predict) { votes[math.predict] += math.accuracy * 2; algos.push(`Math ML(${(math.accuracy * 100).toFixed(0)}%)`); }

  const ng = predictNGram(txArr);
  votes[ng] += 1.0;
  if (algos.length === 0) algos.push('N-Gram');

  let raw = votes.TAI > votes.XIU ? 'TAI' : 'XIU';
  const total = votes.TAI + votes.XIU;
  const confidence = total > 0 ? ((votes[raw] / total) * 100).toFixed(1) : 50;

  let isReversing = false;
  let final = raw;
  if (historyRecords && historyRecords.length >= 10) {
    const winRate = historyRecords.filter(x => x.isCorrect).length / historyRecords.length;
    if (winRate < 0.45) { isReversing = true; final = raw === 'TAI' ? 'XIU' : 'TAI'; }
  }

  return { predict: final, confidence, algo: algos.join(' + '), isReversing };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const [srcRes, bin] = await Promise.all([
      fetch(SOURCE_API + '?_=' + Date.now()),
      getBin()
    ]);
    const list = await srcRes.json();
    if (!list || list.length === 0) return res.status(500).json({ error: 'Không lấy được dữ liệu' });

    const latestPhien = list[0].Phien;
    let history = bin.history || [];
    let pendingId = bin.pendingId || null;
    let pendingPredict = bin.pendingPredict || null;
    let pendingAlgo = bin.pendingAlgo || null;
    let pendingConfidence = bin.pendingConfidence || null;
    let isReversing = bin.isReversing || false;
    let changed = false;

    // Nếu phiên pending đã có kết quả
    if (pendingId && latestPhien >= pendingId) {
      const found = list.find(x => x.Phien === pendingId);
      if (found) {
        const actual = toTX(found.Ket_qua);
        history.unshift({
          phien: pendingId,
          duDoan: pendingPredict,
          ketQua: actual,
          isCorrect: pendingPredict === actual,
          wasReversed: isReversing,
          algo: pendingAlgo,
          time: new Date().toISOString()
        });
        if (history.length > 1000) history.pop();
        pendingId = null;
        changed = true;
      }
    }

    // Tạo dự đoán mới nếu chưa có pending
    if (!pendingId) {
      const ensemble = runEnsemble(list.slice(0, 60), history);
      pendingId = latestPhien + 1;
      pendingPredict = ensemble.predict;
      pendingAlgo = ensemble.algo;
      pendingConfidence = ensemble.confidence;
      isReversing = ensemble.isReversing;
      changed = true;
    }

    if (changed) {
      await saveBin({ history, pendingId, pendingPredict, pendingAlgo, pendingConfidence, isReversing });
    }

    return res.status(200).json({
      pendingId,
      pendingPredict,
      pendingAlgo,
      pendingConfidence,
      isReversing,
      history: history.slice(0, 50),
      currentPhien: latestPhien,
      currentKetQua: toTX(list[0].Ket_qua)
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

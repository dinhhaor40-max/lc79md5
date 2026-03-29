// Endpoint này được gọi bởi cron job hoặc HTML để track phiên mới
// Nó fetch API gốc, so sánh với phiên cuối trong history, nếu mới thì lưu

const SOURCE_API = 'https://lcmd5-dztd.onrender.com/api/taixiumd5';
const BIN_ID = process.env.JSONBIN_ID;
const API_KEY = process.env.JSONBIN_KEY;
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

async function getHistory() {
  const res = await fetch(BIN_URL + '/latest', {
    headers: { 'X-Master-Key': API_KEY }
  });
  const data = await res.json();
  return data.record.history || [];
}

async function saveHistory(history) {
  await fetch(BIN_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': API_KEY
    },
    body: JSON.stringify({ history })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Lấy dữ liệu hiện tại từ API gốc
    const srcRes = await fetch(SOURCE_API + '?_=' + Date.now());
    const current = await srcRes.json();

    const history = await getHistory();
    const lastSaved = history[0];

    // Nếu có phiên trước đó trong history và phiên hiện tại khác phiên cuối
    // thì phiên cuối đã có kết quả → lưu vào history
    if (lastSaved && lastSaved.phien !== current.Phien && !lastSaved.ketQua) {
      // Cập nhật kết quả cho phiên trước
      history[0].ketQua = current.Ket_qua;
      history[0].dungSai = history[0].duDoan === current.Ket_qua ? 'Đúng' : 'Sai';
    }

    // Thêm phiên hiện tại nếu chưa có
    if (!lastSaved || lastSaved.phien !== current.Phien) {
      history.unshift({
        phien: current.Phien,
        duDoan: current.Du_doan,
        ketQua: null, // chờ phiên sau
        dungSai: null,
        time: new Date().toISOString()
      });
      if (history.length > 1000) history.pop();
      await saveHistory(history);
    }

    return res.status(200).json({
      current,
      saved: history.length,
      latest: history[0]
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

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

  if (req.method === 'GET') {
    const history = await getHistory();
    return res.status(200).json(history.slice(0, 50));
  }

  if (req.method === 'POST') {
    const { phien, duDoan, ketQua } = req.body;
    if (!phien || !duDoan || !ketQua) {
      return res.status(400).json({ error: 'Thiếu dữ liệu' });
    }
    const history = await getHistory();
    // Kiểm tra phiên đã tồn tại chưa
    if (history.find(h => h.phien === phien)) {
      return res.status(200).json({ message: 'Phiên đã tồn tại' });
    }
    history.unshift({
      phien,
      duDoan,
      ketQua,
      dungSai: duDoan === ketQua ? 'Đúng' : 'Sai',
      time: new Date().toISOString()
    });
    if (history.length > 1000) history.pop();
    await saveHistory(history);
    return res.status(200).json({ message: 'OK' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

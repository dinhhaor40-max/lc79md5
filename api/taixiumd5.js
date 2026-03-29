export default async function handler(req, res) {
  try {
    const response = await fetch('https://lcmd5-dztd.onrender.com/api/taixiumd5');
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi kết nối' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const response = await fetch('https://lc79-server-production.up.railway.app/api/lichsu?_=' + Date.now());
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi kết nối' });
  }
}

export default async function handler(req, res) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=" + process.env.API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "你好" }] }]
      })
    }
  );

  const data = await response.json();
  res.status(200).json(data);
}

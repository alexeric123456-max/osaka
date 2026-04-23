export default async function handler(req, res) {
  const { placeName } = req.body;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" + process.env.API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `請用繁體中文，用一句吸引人的話介紹「${placeName}」這個位於大阪心齋橋的地點`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "這是一個非常值得一去的地方！";

    res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ text: "心齋橋必訪景點，深受遊客喜愛。" });
  }
}

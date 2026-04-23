export async function getPlaceReviewSummary(placeName: string) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ placeName }),
    });

    const data = await res.json();
    return data.text;
  } catch (error) {
    console.error("API Error:", error);
    return "心齋橋必訪景點，深受遊客喜愛。";
  }
}

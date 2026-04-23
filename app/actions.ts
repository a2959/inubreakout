'use server'

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL;

export async function saveGameRecord(name: string, finishTime: string) {
  if (!GAS_URL) {
    console.error("GOOGLE SPREADSHEET URL (GAS_URL) is not defined.");
    return { success: false, error: "Configuration missing" };
  }

  try {
    const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    
    const body = JSON.stringify({
      timestamp: timestamp,
      name: name,
      finishtime: finishTime
    });
    
    console.log("Saving record to GAS:", body);
    
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    });

    console.log("GAS Response Status:", response.status);

    if (response.ok) {
      return { success: true };
    } else {
      return { success: false, error: "Failed to save to Sheets" };
    }
  } catch (error) {
    console.error("Error saving game record:", error);
    return { success: false, error: "Network error" };
  }
}

export async function getLeaderboard() {
  if (!GAS_URL) return [];

  try {
    const response = await fetch(GAS_URL, { cache: 'no-store' });
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return [];
  }
}

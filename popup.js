document.getElementById('searchBtn').addEventListener('click', () => {
  const email = document.getElementById('emailInput').value;
  if (email) {
    getAuthTokenAndFetch(email);
  }
});

// --- 設定エリア ---
// 探したい時間の範囲（ここを自由に変えてください）
const WORK_START_HOUR = 9; // 朝9時から
const WORK_END_HOUR = 20;   // 夜20時まで
const MIN_DURATION_MINUTES = 30; // 30分未満の空きは表示しない
// ----------------

function getAuthTokenAndFetch(email) {
  document.getElementById('status').textContent = '認証中...';
  
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    if (chrome.runtime.lastError) {
      document.getElementById('status').textContent = '認証エラー: ' + chrome.runtime.lastError.message;
      return;
    }
    fetchCalendarEvents(token, email);
  });
}

async function fetchCalendarEvents(token, email) {
  document.getElementById('status').textContent = '空き時間を計算中...';

  // 今週の月曜と金曜を計算
  const now = new Date();
  const day = now.getDay(); 
  const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1); 
  
  const monday = new Date(now.setDate(diffToMon));
  monday.setHours(0, 0, 0, 0);
  
  const friday = new Date(now.setDate(diffToMon + 4));
  friday.setHours(23, 59, 59, 999);

  const timeMin = monday.toISOString();
  const timeMax = friday.toISOString();

  // APIリクエスト
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!response.ok) throw new Error(`Error: ${response.status}`);

    const data = await response.json();
    renderFreeTime(data.items, monday); // ここで新しい関数を呼ぶ
    document.getElementById('status').textContent = '';

  } catch (error) {
    document.getElementById('status').textContent = '取得失敗: アドレスを確認してください。';
    console.error(error);
  }
}

function renderFreeTime(events, startOfWeek) {
  const container = document.getElementById('calendar');
  container.innerHTML = '';
  const days = ['月', '火', '水', '木', '金'];
  
  for (let i = 0; i < 5; i++) {
    // 1. その日の枠を作る
    const col = document.createElement('div');
    col.className = 'day-column';
    
    // 2. 日付ヘッダー
    const targetDate = new Date(startOfWeek);
    targetDate.setDate(targetDate.getDate() + i);
    
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = `${targetDate.getDate()} (${days[i]})`;
    col.appendChild(header);

    // 3. 業務開始・終了時間のDateオブジェクトを作成
    const workStart = new Date(targetDate);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    
    const workEnd = new Date(targetDate);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    // 4. その日のイベントだけ抽出＆整形
    const dayEvents = events.filter(e => {
      const eStart = new Date(e.start.dateTime || e.start.date);
      // 終日予定などは一旦無視して、時間が決まっているものだけ見る簡易実装
      return eStart.getDate() === targetDate.getDate() && e.start.dateTime;
    });

    // 5. 空き時間を計算するロジック
    // 「現在地（cursor）」を始業時間にセットし、イベントが来るたびに隙間があるかチェックする
    let cursor = workStart;

    dayEvents.forEach(e => {
      const eStart = new Date(e.start.dateTime);
      const eEnd = new Date(e.end.dateTime);

      // イベントが業務時間外なら無視
      if (eEnd <= workStart || eStart >= workEnd) return;

      // 隙間があるか？ (現在地 < イベント開始)
      if (cursor < eStart) {
        // 隙間の終了は「イベント開始」または「業務終了」の早い方
        const gapEnd = eStart < workEnd ? eStart : workEnd;
        addSlotToDom(col, cursor, gapEnd);
      }

      // カーソルを「イベント終了」または「現在地の遅い方」に進める
      if (eEnd > cursor) {
        cursor = eEnd;
      }
    });

    // 最後のイベントが終わった後、終業時間までの隙間
    if (cursor < workEnd) {
      addSlotToDom(col, cursor, workEnd);
    }

    container.appendChild(col);
  }
}

// 画面に「14:00〜14:30 (30分)」を追加する関数
function addSlotToDom(container, start, end) {
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);

  // 指定した分数（例:30分）未満の隙間は表示しない
  if (diffMins < MIN_DURATION_MINUTES) return;

  const div = document.createElement('div');
  div.className = 'event-item';
  
  // スタイル調整（空き時間っぽく色を変える）
  div.style.backgroundColor = '#e6fffa'; // 薄い緑
  div.style.color = '#00796b';           // 濃い緑
  div.style.border = '1px solid #b2f5ea';

  const startStr = formatTime(start);
  const endStr = formatTime(end);

  div.textContent = `${startStr}〜${endStr} (${diffMins}分)`;
  container.appendChild(div);
}

function formatTime(date) {
  return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
}
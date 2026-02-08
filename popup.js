document.getElementById('searchBtn').addEventListener('click', () => {
  const email = document.getElementById('emailInput').value;
  if (email) {
    getAuthTokenAndFetch(email);
  }
});

// --- 設定エリア ---
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 20;
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

  // 【修正点】今日の日付（0時0分）を取得してスタート地点にする
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  // 取得範囲：今日から向こう14日間（土日を飛ばしても5日分確保するため長めに）
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 14);
  endDate.setHours(23, 59, 59, 999);

  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();

  // APIリクエスト
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!response.ok) throw new Error(`Error: ${response.status}`);

    const data = await response.json();
    renderFreeTime(data.items, startDate); // startDateを渡す
    document.getElementById('status').textContent = '';

  } catch (error) {
    document.getElementById('status').textContent = '取得失敗: アドレスを確認してください。';
    console.error(error);
  }
}

function renderFreeTime(events, startDay) {
  const container = document.getElementById('calendar');
  container.innerHTML = '';
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  
  // 【修正点】「今日」からループを開始し、平日が5つ埋まるまで続ける
  let count = 0;
  let currentTargetDate = new Date(startDay);

  // 最大ループ回数は安全のため制限（無限ループ防止）
  while (count < 5) {
    const dayOfWeek = currentTargetDate.getDay();

    // 土日(0=Sun, 6=Sat)ならスキップして日付を進める
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentTargetDate.setDate(currentTargetDate.getDate() + 1);
      continue;
    }

    // 1. カラム作成
    const col = document.createElement('div');
    col.className = 'day-column';
    
    // 2. 日付ヘッダー
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = `${currentTargetDate.getDate()} (${days[dayOfWeek]})`;
    col.appendChild(header);

    // 3. 業務時間の範囲定義
    const workStart = new Date(currentTargetDate);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    
    const workEnd = new Date(currentTargetDate);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    // 4. その日のイベント抽出
    const dayEvents = events.filter(e => {
      const eStart = new Date(e.start.dateTime || e.start.date);
      // 同じ日付かチェック
      return eStart.getDate() === currentTargetDate.getDate() 
          && eStart.getMonth() === currentTargetDate.getMonth()
          && e.start.dateTime; // 終日予定などは簡易除外
    });

    // 5. 空き時間計算ロジック（前回と同じ）
    let cursor = workStart;

    dayEvents.forEach(e => {
      const eStart = new Date(e.start.dateTime);
      const eEnd = new Date(e.end.dateTime);

      if (eEnd <= workStart || eStart >= workEnd) return;

      if (cursor < eStart) {
        const gapEnd = eStart < workEnd ? eStart : workEnd;
        addSlotToDom(col, cursor, gapEnd);
      }

      if (eEnd > cursor) {
        cursor = eEnd;
      }
    });

    if (cursor < workEnd) {
      addSlotToDom(col, cursor, workEnd);
    }

    container.appendChild(col);
    
    // カウンタを進め、日付を翌日に
    count++;
    currentTargetDate.setDate(currentTargetDate.getDate() + 1);
  }
}

function addSlotToDom(container, start, end) {
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < MIN_DURATION_MINUTES) return;

  const div = document.createElement('div');
  div.className = 'event-item';
  div.style.backgroundColor = '#e6fffa'; 
  div.style.color = '#00796b';           
  div.style.border = '1px solid #b2f5ea';

  const startStr = formatTime(start);
  const endStr = formatTime(end);

  div.textContent = `${startStr}〜${endStr} (${diffMins}分)`;
  container.appendChild(div);
}

function formatTime(date) {
  return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
}
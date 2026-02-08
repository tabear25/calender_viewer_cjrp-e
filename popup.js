document.getElementById('searchBtn').addEventListener('click', () => {
  const email = document.getElementById('emailInput').value;
  if (email) {
    getAuthTokenAndFetch(email);
  }
});

function getAuthTokenAndFetch(email) {
  document.getElementById('status').textContent = '認証中...';
  
  // 1. Google アカウント認証
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    if (chrome.runtime.lastError) {
      document.getElementById('status').textContent = '認証エラー: ' + chrome.runtime.lastError.message;
      return;
    }
    fetchCalendarEvents(token, email);
  });
}

async function fetchCalendarEvents(token, email) {
  document.getElementById('status').textContent = 'データ取得中...';

  // 今週の月曜と金曜を計算
  const now = new Date();
  const day = now.getDay(); // 0:Sun, 1:Mon...
  const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1); 
  
  const monday = new Date(now.setDate(diffToMon));
  monday.setHours(0, 0, 0, 0);
  
  const friday = new Date(now.setDate(diffToMon + 4));
  friday.setHours(23, 59, 59, 999);

  // ISO形式に変換
  const timeMin = monday.toISOString();
  const timeMax = friday.toISOString();

  // 2. Calendar API を叩く
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    renderCalendar(data.items, monday);
    document.getElementById('status').textContent = '';

  } catch (error) {
    document.getElementById('status').textContent = '取得失敗: 権限がないか、アドレスが間違っています。';
    console.error(error);
  }
}

function renderCalendar(events, startOfWeek) {
  const container = document.getElementById('calendar');
  container.innerHTML = '';

  const days = ['月', '火', '水', '木', '金'];
  
  // 5日分の列を作成
  for (let i = 0; i < 5; i++) {
    const col = document.createElement('div');
    col.className = 'day-column';
    
    // ヘッダー（日付）
    const header = document.createElement('div');
    header.className = 'day-header';
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    header.textContent = `${d.getDate()} (${days[i]})`;
    col.appendChild(header);

    // その日のイベントをフィルタリングして追加
    const dayEvents = events.filter(e => {
      const eventDate = new Date(e.start.dateTime || e.start.date);
      return eventDate.getDate() === d.getDate();
    });

    dayEvents.forEach(e => {
      const div = document.createElement('div');
      div.className = 'event-item';
      // 時間だけ表示（終日の場合はタイトル）
      const timeStr = e.start.dateTime ? new Date(e.start.dateTime).getHours() + ':' + String(new Date(e.start.dateTime).getMinutes()).padStart(2, '0') : '終日';
      div.textContent = `${timeStr} ${e.summary || '(No Title)'}`;
      div.title = e.summary; // マウスオーバーで全表示
      col.appendChild(div);
    });

    container.appendChild(col);
  }
}
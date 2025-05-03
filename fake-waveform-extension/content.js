console.log("content.js loaded");

let settings = {};
let video;
let lastTime = 0;
previousTime = 0; // Reset when loading new video
let lastKnownDuration = 0;
let notifiedClaims = new Set();
let dingAudio = new Audio(chrome.runtime.getURL('sounds/ding.mp3'));

const fakeClaims = [
  { time: 30, score: 0.2, text: "Minor error." },
  { time: 90, score: 0.6, text: "Significant false claim." },
  { time: 150, score: 0.9, text: "Major misinformation." }
];

chrome.storage.sync.get([
  'bgColor', 'lineColor', 'timeMarkerColor', 'theme',
  'notificationDuration', 'jumpBackSeconds', 'showWaveform', 'soundEnabled'
], (data) => {
  settings = { ...data };
  waitForVideo();
});

chrome.runtime.onMessage.addListener((message) => {
  console.log("Message received:", message);
  console.log("New settings loaded, redrawing waveform...");
  if (message.action === "updateSettings") {
    chrome.storage.sync.get([
      'bgColor', 'lineColor', 'timeMarkerColor', 'theme',
      'notificationDuration', 'jumpBackSeconds', 'showWaveform', 'soundEnabled'
    ], (data) => {
      settings = {
        bgColor: data.bgColor,
        lineColor: data.lineColor,
        timeMarkerColor: data.timeMarkerColor,
        theme: data.theme,
        notificationDuration: data.notificationDuration,
        jumpBackSeconds: data.jumpBackSeconds,
        showWaveform: data.showWaveform,
        soundEnabled: data.soundEnabled
      };
	  console.log("New settings loaded, redrawing waveform...");
      applySettings();
    });
  }
});

function applyThemeSettings() {
  if (settings.theme === "light") {
    settings.bgColor = 'rgba(255,255,255,0.2)';
    settings.lineColor = '#1DB9FF';
    settings.timeMarkerColor = 'black';
  } else if (settings.theme === "dark") {
    settings.bgColor = 'rgba(0,0,0,0.3)';
    settings.lineColor = '#1DB9FF';
    settings.timeMarkerColor = 'white';
  }
  drawWaveform(); // redraw the bar immediately with new settings
}

function waitForVideo() {
  const interval = setInterval(() => {
    video = document.querySelector('video');
    if (video) {
      clearInterval(interval);
      setupWaveform();
    }
  }, 500);
}

let currentVideoId = null;

function checkForNewVideo() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (videoId && videoId !== currentVideoId) {
    currentVideoId = videoId;
    console.log("New video detected:", videoId);
    fetchTranscriptFromPage();
  }
}

setInterval(checkForNewVideo, 1000);

function fetchTranscriptFromPage() {
  const scripts = Array.from(document.querySelectorAll('script'));
  const playerScript = scripts.find(s => s.textContent.includes('ytInitialPlayerResponse'));
  if (!playerScript) return console.warn("❌ No ytInitialPlayerResponse script found");

  const match = playerScript.textContent.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
  if (!match || !match[1]) return console.warn("❌ Could not parse ytInitialPlayerResponse JSON");

  let playerData;
  try {
    playerData = JSON.parse(match[1]);
  } catch (e) {
    console.error("❌ Failed to parse player response JSON:", e);
    return;
  }

  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || !tracks.length) return console.warn("No caption tracks found");

  const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
  if (!track || !track.baseUrl) return console.warn("No valid caption track URL");

  fetch(track.baseUrl)
    .then(res => res.text())
    .then(xml => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, "text/xml");
      const texts = Array.from(xmlDoc.getElementsByTagName("text")).map(t => ({
        startTime: parseFloat(t.getAttribute("start")),
        endTime: parseFloat(t.getAttribute("start")) + parseFloat(t.getAttribute("dur")),
        text: t.textContent
      }));
		console.log("Transcript from page:");
		console.table(texts);

		//Save to file too
		saveTranscriptToFile(texts, currentVideoId);
    })
    .catch(err => {
      console.error("Failed to fetch transcript:", err);
    });
}

function saveTranscriptToFile(transcriptArray, videoId) {
  const lines = transcriptArray.map(claim =>
    `[${claim.startTime.toFixed(2)} - ${claim.endTime.toFixed(2)}] ${claim.text}`
  );

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript_${videoId}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupWaveform() {
  const container = document.createElement('div');
  container.id = 'waveformContainer';
  container.style.position = 'fixed';
  container.style.top = '15px'; // Lower the bar so it's visible
  container.style.left = '70%'; // Center better
  container.style.width = '20%'; // Wider
  container.style.height = '30px';
  container.style.zIndex = '5000';
  container.style.pointerEvents = 'none';
  container.style.backgroundColor = settings.bgColor || 'rgba(0,0,0,0.15)';
  container.style.borderRadius = '10px';
  container.style.display = settings.showWaveform ? 'block' : 'none';
  container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  document.body.appendChild(container);

  const marker = document.createElement('div');
  marker.id = 'timeMarker';
  marker.style.position = 'absolute';
  marker.style.top = '0';
  marker.style.width = '2px';
  marker.style.height = '100%';
  marker.style.backgroundColor = settings.timeMarkerColor || '#ffffff';
  container.appendChild(marker);

  drawWaveform();
  startMarkerUpdate();
}

function applySettings() {
  const container = document.getElementById('waveformContainer');
  if (container) {
    container.style.backgroundColor = settings.bgColor;
    container.style.display = settings.showWaveform ? 'block' : 'none';
  }
  const marker = document.getElementById('timeMarker');
  if (marker) {
    marker.style.backgroundColor = settings.timeMarkerColor;
  }
  drawWaveform();
}

function drawWaveform() {

  const container = document.getElementById('waveformContainer');
  if (!container) return;

  container.querySelectorAll('.claim-dot').forEach(dot => dot.remove());
  const oldCanvas = document.getElementById('waveformCanvas');
  if (oldCanvas) oldCanvas.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'waveformCanvas';
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = settings.lineColor || '#1DB9FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  const duration = video?.duration || lastKnownDuration || 200;

  fakeClaims.forEach(claim => {
    const x = (claim.time / duration) * canvas.width;

    const dot = document.createElement('div');
    dot.className = 'claim-dot';
    dot.style.position = 'absolute';
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.backgroundColor = getDotColor(claim.score);
    dot.style.borderRadius = '50%';
    dot.style.left = `${x - 4}px`;
    dot.style.top = `${(canvas.height / 2) - 4}px`;
    dot.style.zIndex = '1001';
    dot.style.pointerEvents = 'auto';
    dot.style.cursor = 'pointer';

    dot.addEventListener('mouseenter', (e) => {
      showTooltip(claim.text, e.pageX, e.pageY - 30);
    });

    dot.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    dot.addEventListener('click', () => {
      let jumpTo = claim.time - (settings.jumpBackSeconds || 10);
      if (jumpTo < 0) jumpTo = 0;
      video.currentTime = jumpTo;
    });

    container.appendChild(dot);
  });
}

function getDotColor(score) {
  if (score <= 0.3) return 'gray';
  if (score <= 0.6) return 'yellow';
  if (score <= 0.8) return 'orange';
  return 'red';
}

function startMarkerUpdate() {
  const marker = document.getElementById('timeMarker');
  setInterval(() => {
    if (!video || !marker) return;

    const progress = (video.currentTime / video.duration) * 100;
    marker.style.left = `${progress}%`;

	  for (let claimTimestamp of Array.from(notifiedClaims)) {
		if (claimTimestamp > video.currentTime) {
		  notifiedClaims.delete(claimTimestamp);
		}
	  }
    lastTime = video.currentTime;

    checkForClaimNotification(video.currentTime);

    if (video.duration !== lastKnownDuration && video.duration > 0) {
      lastKnownDuration = video.duration;
      drawWaveform();
    }
  }, 100);
}

function showTooltip(text, x, y) {
  let tooltip = document.getElementById('floatingTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'floatingTooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.padding = '5px 10px';
    tooltip.style.backgroundColor = 'black';
    tooltip.style.color = 'white';
    tooltip.style.borderRadius = '5px';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '5002';
    tooltip.style.pointerEvents = 'none';
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = text;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.style.display = 'block';
}

function hideTooltip() {
  const tooltip = document.getElementById('floatingTooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function checkForClaimNotification(currentTime) {
  fakeClaims.forEach(claim => {
    if (!notifiedClaims.has(claim.time) && currentTime >= claim.time && currentTime - claim.time < 5) {
      showNotificationPopup(claim.text);
      notifiedClaims.add(claim.time);
    }
  });
}

function showNotificationPopup(text) {
  let popup = document.getElementById('claimNotificationPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'claimNotificationPopup';
    popup.style.position = 'fixed';
    popup.style.top = '70px';
    popup.style.right = '20px';
    popup.style.padding = '10px 20px';
    popup.style.backgroundColor = 'rgba(255,0,0,0.8)';
    popup.style.color = 'white';
    popup.style.borderRadius = '8px';
    popup.style.zIndex = '9999';
    popup.style.fontSize = '14px';
    popup.style.opacity = '0';
    popup.style.transition = 'opacity 0.5s ease';
    document.body.appendChild(popup);
  }
  popup.textContent = "Problematic Claim Detected: " + text;
  popup.style.opacity = '1';
  if (settings.soundEnabled) {
	dingAudio.play().catch(e => console.log('Ding sound failed:', e));
  }
  setTimeout(() => {
    popup.style.opacity = '0';
  }, (settings.notificationDuration || 15) * 1000);
    // ====== ADD DEBUG LOGS ======
  console.log("settings.soundEnabled =", settings.soundEnabled);
  if (dingAudio) {
    console.log("dingAudio object exists");
    if (settings.soundEnabled) {
      console.log("Trying to play ding sound...");
      dingAudio.play().then(() => {
        console.log("Ding sound played successfully");
      }).catch((e) => {
        console.error("Ding play blocked/error:", e);
      });
    } else {
      console.log("Sound is disabled in settings, not playing ding.");
    }
  } else {
    console.error("dingAudio is undefined ");
  }
}

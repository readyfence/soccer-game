// Website interactions: commentary samples and the screenshot lightbox.

const VOICE = '/audio/voice/';
let current = null;

for (const btn of document.querySelectorAll('.listen button')) {
  btn.addEventListener('click', () => {
    if (current) {
      current.audio.pause();
      current.btn.classList.remove('on');
    }
    if (current?.btn === btn) {
      current = null;
      return;
    }
    const audio = new Audio(`${VOICE}${btn.dataset.clip}.mp3`);
    current = { audio, btn };
    btn.classList.add('on');
    audio.addEventListener('ended', () => {
      btn.classList.remove('on');
      if (current?.btn === btn) current = null;
    });
    audio.play().catch(() => btn.classList.remove('on'));
  });
}

const box = document.getElementById('lightbox');
if (box?.showModal) {
  const img = box.querySelector('img');
  for (const fig of document.querySelectorAll('.shots figure')) {
    fig.addEventListener('click', () => {
      const src = fig.querySelector('img');
      img.src = src.src;
      img.alt = src.alt;
      box.showModal();
    });
  }
  box.querySelector('button').addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => {
    if (e.target === box) box.close();
  });
}

// Pause the hero video for people who prefer less motion.
if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  document.querySelector('.hero-video')?.pause();
}

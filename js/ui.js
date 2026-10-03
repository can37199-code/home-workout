// 브라우저 confirm/alert 대신 쓰는 앱 안 대화상자 (설치형 PWA에서 기본 대화상자가 막히는 경우가 있음)
function dialog({ title, message = '', ok = '확인', cancel = null, danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        ${title ? `<h2></h2>` : ''}
        <p class="modal-msg"></p>
        <div class="modal-btns">
          ${cancel ? '<button class="btn ghost" data-v="0"></button>' : ''}
          <button class="btn ${danger ? 'danger-fill' : 'primary'}" data-v="1"></button>
        </div>
      </div>`;
    if (title) el.querySelector('h2').textContent = title;
    el.querySelector('.modal-msg').textContent = message;
    el.querySelector('[data-v="1"]').textContent = ok;
    if (cancel) el.querySelector('[data-v="0"]').textContent = cancel;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b && e.target !== el) return;
      el.remove();
      resolve(b ? b.dataset.v === '1' : false);
    });
    document.body.append(el);
    el.querySelector('[data-v="1"]').focus();
  });
}

export const ask = (title, message, ok = '확인', opts = {}) => dialog({ title, message, ok, cancel: opts.cancel || '취소', danger: opts.danger });
export const notify = (message, title = '') => dialog({ title, message });

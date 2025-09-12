// Popup script для настроек расширения
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎛️ Popup loaded');

  // Загружаем сохраненные настройки
  const settings = await chrome.storage.sync.get({
    enablePlayer: true,
    defaultQuality: '720',
    autoplay: true,
    showNotifications: true,
    bufferSize: '10'
  });

  console.log('📋 Loaded settings:', settings);

  // Устанавливаем значения в форму
  document.getElementById('enablePlayer').checked = settings.enablePlayer;
  document.getElementById('defaultQuality').value = settings.defaultQuality;
  document.getElementById('autoplay').checked = settings.autoplay;
  document.getElementById('showNotifications').checked = settings.showNotifications;
  document.getElementById('bufferSize').value = settings.bufferSize;

  // Обновляем статус
  updateStatus(settings.enablePlayer);

  // Получаем информацию о текущей вкладке
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isValidSite = tab?.url?.includes('animestars.org') || tab?.url?.includes('asstars.tv');
    
    if (isValidSite) {
      // Запрашиваем статистику у content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PLAYERS_INFO' });
        console.log('📊 Players info:', response);
        updatePlayersInfo(response);
      } catch (error) {
        console.log('📝 Content script not ready yet');
      }
    }
  } catch (error) {
    console.log('🚫 Error getting tab info:', error);
  }

  // Сохраняем настройки при изменении
  const inputs = document.querySelectorAll('input, select');
  inputs.forEach(input => {
    input.addEventListener('change', async () => {
      const newSettings = {
        enablePlayer: document.getElementById('enablePlayer').checked,
        defaultQuality: document.getElementById('defaultQuality').value,
        autoplay: document.getElementById('autoplay').checked,
        showNotifications: document.getElementById('showNotifications').checked,
        bufferSize: document.getElementById('bufferSize').value
      };

      console.log('💾 Saving settings:', newSettings);
      await chrome.storage.sync.set(newSettings);
      updateStatus(newSettings.enablePlayer);

      // Уведомляем content script об изменениях
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('animestars.org') || tab?.url?.includes('asstars.tv')) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: newSettings
          });
          console.log('📤 Settings sent to content script');
        }
      } catch (error) {
        console.log('📝 Tab not ready for messages:', error);
      }
    });
  });

  // Обработчик кнопки перезагрузки
  document.getElementById('reloadPlayers').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes('animestars.org') || tab?.url?.includes('asstars.tv')) {
        await chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_PLAYERS' });
        console.log('🔄 Reload command sent');
        
        // Показываем обратную связь
        const btn = document.getElementById('reloadPlayers');
        const originalText = btn.textContent;
        btn.textContent = '✓ Перезагружено';
        btn.disabled = true;
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
      } else {
        alert('Откройте страницу AnimStars для перезагрузки плееров');
      }
    } catch (error) {
      console.error('❌ Error reloading players:', error);
      alert('Ошибка при перезагрузке плееров');
    }
  });

  // Обработчик кнопки дополнительных настроек
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.();
  });
});

function updateStatus(enabled) {
  const statusEl = document.getElementById('status');
  if (enabled) {
    statusEl.className = 'status active';
    statusEl.textContent = '✅ Расширение активно';
  } else {
    statusEl.className = 'status inactive';
    statusEl.textContent = '❌ Расширение отключено';
  }
}

function updatePlayersInfo(info) {
  if (!info) return;
  
  const statusEl = document.getElementById('status');
  if (info.detected > 0) {
    statusEl.innerHTML = `
      ✅ Найдено плееров: ${info.detected}<br>
      🚀 Заменено: ${info.replaced}
    `;
  }
}

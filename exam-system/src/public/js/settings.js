'use strict';
/* global App */
(function () {
  const KEYS = ['default_duration_minutes', 'remind_before_minutes', 'remind_interval_minutes', 'judge_compile_timeout_sec', 'judge_run_timeout_sec'];
  const DEFAULTS = { default_duration_minutes: 120, remind_before_minutes: 30, remind_interval_minutes: 10, judge_compile_timeout_sec: 30, judge_run_timeout_sec: 60 };

  document.getElementById('btnSave').addEventListener('click', async () => {
    const body = {};
    for (const k of KEYS) body[k] = document.getElementById(k).value;
    try {
      const r = await App.postJSON('/api/settings', body);
      App.toast('已保存 ' + r.changed + ' 项配置');
    } catch (e) { App.toast('保存失败：' + e.message, true); }
  });

  document.getElementById('btnReset').addEventListener('click', async () => {
    for (const k of KEYS) document.getElementById(k).value = DEFAULTS[k];
    try {
      await App.postJSON('/api/settings', DEFAULTS);
      App.toast('已恢复默认配置');
    } catch (e) { App.toast('恢复默认失败：' + e.message, true); }
  });

  document.getElementById('btnRescan').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/questionbank/rescan', {});
      App.toast('扫描完成：加载 ' + r.loaded + ' 套，失败 ' + r.failed + ' 个');
      setTimeout(() => location.reload(), 600);
    } catch (e) { App.toast('扫描失败：' + e.message, true); }
  });
})();

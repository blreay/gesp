'use strict';
/* global App */
(function () {
  const KEYS = ['default_duration_minutes', 'remind_before_minutes', 'remind_interval_minutes', 'judge_compile_timeout_sec', 'judge_run_timeout_sec', 'ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model', 'ai_max_tokens', 'ai_show_thinking', 'ai_system_prompt', 'ai_auto_parse', 'ai_parse_concurrency'];
  const DEFAULTS = { default_duration_minutes: 120, remind_before_minutes: 30, remind_interval_minutes: 10, judge_compile_timeout_sec: 30, judge_run_timeout_sec: 60, ai_webui_url: 'http://121.40.190.90:3000/', ai_base_url: 'http://121.40.190.90:4000', ai_api_key: 'sk-vllm-aaa-bbb', ai_model: 'qwen-local', ai_max_tokens: 8192, ai_show_thinking: '0', ai_system_prompt: '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）', ai_auto_parse: '0', ai_parse_concurrency: '4' };

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

  document.getElementById('btnFullParse').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/ai-parse/full', {});
      if (r.queued > 0) {
        App.toast('已启动全量AI解析，共 ' + r.queued + ' 题');
        setTimeout(() => { location.href = '/review'; }, 400);
      } else {
        App.toast('没有需要解析的错题（仅解析备注为空的错题）');
      }
    } catch (e) { App.toast('启动失败：' + e.message, true); }
  });
})();

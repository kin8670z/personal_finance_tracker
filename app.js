function toggleHeaderMenu(e) { if (e) e.stopPropagation(); const m = document.getElementById('headerDropdownMenu'), a = document.getElementById('menuArrowIcon'); if (m.classList.contains('hidden')) { m.classList.remove('hidden'); a.style.transform = 'rotate(180deg)'; } else closeHeaderMenu(); }
function closeHeaderMenu() { const m = document.getElementById('headerDropdownMenu'), a = document.getElementById('menuArrowIcon'); if (m) m.classList.add('hidden'); if (a) a.style.transform = 'rotate(0deg)'; }
document.addEventListener('click', (e) => { const c = document.getElementById('headerMenuContainer'); if (c && !c.contains(e.target)) closeHeaderMenu(); });
function shiftMonth(d) { const inp = document.getElementById('monthFilter'); inp.value = addMonthsToYM(inp.value || currentYearMonth, d); exitEditMode(); render(); }

function renderReleaseNotes() {
  document.getElementById('releaseNotesContainer').innerHTML = releaseNotesData.map(r => `
    <div class="p-4 rounded-xl border ${r.isLatest ? 'border-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/40' : 'border-slate-200 bg-slate-50/60 dark:bg-slate-900'} space-y-2">
      <div class="flex justify-between items-center"><span class="font-extrabold text-sm">${r.version} <span class="px-2 py-0.5 text-[10px] rounded-full bg-indigo-600 text-white">${r.badge}</span></span><span class="text-[11px] text-slate-400">${r.date}</span></div>
      <ul class="space-y-1 text-xs text-slate-600 dark:text-slate-300">${r.items.map(i => `<li>• ${i}</li>`).join('')}</ul>
    </div>`).join('');
}
function openReleaseModal() { closeHeaderMenu(); setTimeout(() => { renderReleaseNotes(); const m = document.getElementById('releaseModal'); m.classList.remove('hidden'); m.classList.add('flex'); localStorage.setItem('argon_seen_version', APP_VERSION); }, 50); }
function closeReleaseModal() { const m = document.getElementById('releaseModal'); m.classList.add('hidden'); m.classList.remove('flex'); localStorage.setItem('argon_seen_version', APP_VERSION); }
function openGalaxyAutoModal() { closeHeaderMenu(); setTimeout(() => { document.getElementById('webhookUrlExample').textContent = `${window.location.origin + window.location.pathname}?sms={문자내용}&auto=1`; const m = document.getElementById('galaxyAutoModal'); m.classList.remove('hidden'); m.classList.add('flex'); }, 50); }
function closeGalaxyAutoModal() { const m = document.getElementById('galaxyAutoModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function checkVersionUpdatePopup() { if (localStorage.getItem('argon_seen_version') !== APP_VERSION) setTimeout(() => { openReleaseModal(); showToast(`🎉 Pro v${APP_VERSION} 업데이트 완료!`); }, 400); }

function initDarkMode() { if (localStorage.getItem('argon_dark_mode') === 'true') { document.documentElement.classList.add('dark'); const t = document.getElementById('darkModeMenuText'); if (t) t.textContent = '☀️ 라이트 모드로 전환'; } }
function toggleDarkMode() {
  closeHeaderMenu(); const h = document.documentElement, isD = h.classList.contains('dark'), t = document.getElementById('darkModeMenuText');
  if (isD) { h.classList.remove('dark'); localStorage.setItem('argon_dark_mode', 'false'); if (t) t.textContent = '🌙 다크 모드 켜기'; showToast('☀️ 라이트 모드 전환'); }
  else { h.classList.add('dark'); localStorage.setItem('argon_dark_mode', 'true'); if (t) t.textContent = '☀️ 라이트 모드로 전환'; showToast('🌙 다크 모드 켜짐'); }
  render();
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(p => { if (p) document.getElementById('storagePersistBadge').classList.remove('hidden'); });
let deferredPrompt; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('installAppBtn').classList.remove('hidden'); });
async function installPWA() { if (!deferredPrompt) return alert("브라우저 메뉴[⋮] ➔ [홈 화면에 추가(앱 설치)]를 눌러주세요!"); deferredPrompt.prompt(); deferredPrompt = null; }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('opacity-0'); setTimeout(() => t.classList.add('opacity-0'), 3000); }

function toggleHistoryPanel(force) { const b = document.getElementById('historyBody'), t = document.getElementById('historyToggleBtnText'); isHistoryOpen = typeof force === 'boolean' ? force : !isHistoryOpen; b.classList.toggle('hidden', !isHistoryOpen); t.textContent = isHistoryOpen ? '접어두기 ▲' : '펼쳐보기 ▼'; if (isHistoryOpen) renderLogs(); }
function openAndScrollHistory() { closeHeaderMenu(); toggleHistoryPanel(true); document.getElementById('historySection').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function addChangeLog(category, action, detail, meta = {}) {
  const now = Date.now(), latest = changeLogs[0];
  if (category === '수정' && meta.targetTxId && latest && latest.category === '수정' && latest.targetTxId === meta.targetTxId && (now - (latest.timestamp || 0)) < 600000) {
    latest.timestamp = now; latest.time = getNowTimeOnly(); latest.mergeCount = (latest.mergeCount || 1) + 1;
    latest.initialBeforeStr = latest.initialBeforeStr || meta.beforeStr;
    latest.detail = `${latest.initialBeforeStr} ➔ ${meta.afterStr} (연속수정 ${latest.mergeCount}회)`;
    localStorage.setItem('argon_logs_v3', JSON.stringify(changeLogs)); renderLogs(); return;
  }
  changeLogs.unshift({ id: now + Math.random(), timestamp: now, dateStr: today, time: getNowTimeOnly(), category, action, detail, targetTxId: meta.targetTxId || null, initialBeforeStr: meta.beforeStr || null, undoData: meta.undoData || null, undone: false });
  changeLogs = changeLogs.slice(0, 80); localStorage.setItem('argon_logs_v3', JSON.stringify(changeLogs)); renderLogs();
}

function undoFromLog(logId) {
  const log = changeLogs.find(l => l.id === logId); if (!log || !log.undoData || log.undone) return;
  const u = log.undoData; exitEditMode();
  if (u.type === 'delete_single') { transactions.push({ ...u.tx }); log.undone = true; addChangeLog('예산/복원', '삭제 복구', `[${u.tx.merchant}] 복구됨`); }
  else if (u.type === 'delete_group') { u.txList.forEach(i => transactions.push({ ...i })); log.undone = true; addChangeLog('예산/복원', '할부 복구', `[${u.txList[0].merchant}] 복구됨`); }
  else if (u.type === 'edit_single') { const idx = transactions.findIndex(t => t.id === u.beforeTx.id); if (idx !== -1) transactions[idx] = { ...u.beforeTx }; else transactions.push({ ...u.beforeTx }); log.undone = true; addChangeLog('예산/복원', '수정 복구', `[${u.beforeTx.merchant}] 되돌림`); }
  saveAndRender(); showToast('↩️ 복구되었습니다!');
}

function clearChangeLogs() { if (confirm('단순 등록 이력을 정리할까요?')) { changeLogs = changeLogs.filter(l => l.category !== '등록'); localStorage.setItem('argon_logs_v3', JSON.stringify(changeLogs)); renderLogs(); } }
function renderLogs() {
  const f = document.getElementById('logFilter')?.value || 'IMPORTANT', kw = (document.getElementById('logSearchInput')?.value || '').toLowerCase();
  document.getElementById('logCountBadge').textContent = `총 ${changeLogs.length}건`;
  const mb = document.getElementById('menuLogCount'); if (mb) mb.textContent = `${changeLogs.length}건`;
  const sumEl = document.getElementById('latestLogSummary'); if (changeLogs[0]) sumEl.innerHTML = `<b>[${changeLogs[0].action}]</b> ${changeLogs[0].detail}`;
  const filtered = changeLogs.filter(l => (f === 'IMPORTANT' ? l.category !== '등록' : (f === 'ALL' || l.category === f)) && (!kw || l.detail.toLowerCase().includes(kw) || l.action.toLowerCase().includes(kw)));
  const listEl = document.getElementById('changeLogList'), emptyEl = document.getElementById('emptyLogMsg');
  if (!filtered.length) { listEl.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = filtered.map(log => `
    <div class="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-700 text-xs">
      <div class="truncate"><span class="font-extrabold text-indigo-600 dark:text-indigo-400 mr-1.5">[${log.action}]</span><span>${log.detail}</span></div>
      <div class="flex items-center gap-1.5 shrink-0">${log.undoData && !log.undone ? `<button onclick="undoFromLog(${log.id})" class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold text-[11px]">↩️ 복구</button>` : ''}<span class="text-[10px] text-slate-400 font-mono">${log.time}</span></div>
    </div>`).join('');
}

function previewSMS() {
  parsedSMSResults = parseBulkSMS(document.getElementById('smsInput').value);
  const area = document.getElementById('smsPreviewArea'); if (!parsedSMSResults.length) { area.classList.add('hidden'); return; }
  area.classList.remove('hidden'); document.getElementById('smsCountText').textContent = `🔍 자동 분석 완료 (${parsedSMSResults.length}건)`;
  document.getElementById('smsPreviewList').innerHTML = parsedSMSResults.map(i => `<div class="flex justify-between bg-white dark:bg-slate-900 border border-indigo-100 rounded-lg p-2 text-xs"><span><b>[${i.cardCompany}]</b> ${i.merchant} (${i.category})</span><b class="${i.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">${i.amount.toLocaleString()}원</b></div>`).join('');
}
async function pasteAndRegisterClipboard() { try { const t = await navigator.clipboard.readText(); if (!t.trim()) return alert('클립보드가 비어있습니다.'); document.getElementById('smsInput').value = t; previewSMS(); if (parsedSMSResults.length) registerAllSMS(); } catch (e) { alert('아래 입력창에 직접 붙여넣기 해주세요.'); } }
function checkIncomingSharedSMS() { const p = new URLSearchParams(window.location.search), txt = p.get('sms') || p.get('text'); if (txt) { document.getElementById('smsInput').value = txt; previewSMS(); window.history.replaceState({}, document.title, window.location.pathname); if (parsedSMSResults.length) setTimeout(() => registerAllSMS(), 250); } }
function testUrlAutoRegister() { closeGalaxyAutoModal(); const u = `${window.location.pathname}?sms=${encodeURIComponent(`[Web발신] 현대카드 승인 ${today.slice(5,7)}/${today.slice(8,10)} 15:20 18,900원 일시불 쿠팡이츠`)}&auto=1`; window.history.replaceState({}, document.title, u); checkIncomingSharedSMS(); }
function fillSampleSMS() { const m = today.slice(5, 7), d = today.slice(8, 10); document.getElementById('smsInput').value = `[Web발신] 삼성카드 승인 ${m}/${d} 13:10 450,000원 3개월 무신사스토어\n[Web발신] 신한카드 승인 ${m}/${d} 12:30 14,500원 일시불 버거킹강남점 누적 520,000원`; previewSMS(); }
function fillFormFromSMS() { if (!parsedSMSResults.length) return; exitEditMode(); const f = parsedSMSResults[0]; setType(f.type); document.getElementById('txDate').value = f.date; document.getElementById('txCategory').value = f.category; document.getElementById('txMethod').value = f.method; document.getElementById('txCardCompany').value = f.cardCompany; document.getElementById('txInstallment').value = String(f.installmentMonths); document.getElementById('txMerchant').value = f.merchant; document.getElementById('txMemo').value = f.memo; document.getElementById('txAmount').value = f.amount; toggleCardOptions(); updateInstallmentNotice(); }
function registerAllSMS() { if (!parsedSMSResults.length) return; parsedSMSResults.forEach(i => transactions.push(...createTransactionsWithInstallment(i))); addChangeLog('등록', '문자 자동등록', `${parsedSMSResults.length}건 자동 등록`); document.getElementById('monthFilter').value = parsedSMSResults[0].date.slice(0, 7); document.getElementById('smsInput').value = ''; document.getElementById('smsPreviewArea').classList.add('hidden'); parsedSMSResults = []; saveAndRender(); showToast('⚡ 결제문자 자동 등록 완료!'); }

function setType(type) {
  currentType = type; const exp = type === 'expense';
  document.getElementById('btnExpense').className = exp ? 'py-2 text-sm font-bold rounded-md bg-white dark:bg-slate-800 text-rose-600 shadow-sm' : 'py-2 text-sm font-bold rounded-md text-slate-500';
  document.getElementById('btnIncome').className = !exp ? 'py-2 text-sm font-bold rounded-md bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'py-2 text-sm font-bold rounded-md text-slate-500';
  document.getElementById('paymentOptionRow').classList.toggle('hidden', !exp);
  document.getElementById('txCategory').innerHTML = categories[type].map(c => `<option value="${c}">${c}</option>`).join('');
  updateInstallmentNotice();
}
function toggleCardOptions() { const isC = document.getElementById('txMethod').value === '신용카드', b = document.getElementById('installmentBox'); if (!isC) document.getElementById('txInstallment').value = '1'; b.classList.toggle('opacity-40', !isC); b.classList.toggle('pointer-events-none', !isC); updateInstallmentNotice(); }
function updateInstallmentNotice() { const n = document.getElementById('installmentPreviewNotice'), m = Number(document.getElementById('txInstallment').value), a = Number(document.getElementById('txAmount').value); if (currentType === 'expense' && m > 1) { n.classList.remove('hidden'); n.textContent = a > 0 ? `💳 ${m}개월 할부: 매월 약 ${Math.floor(a / m).toLocaleString()}원씩 분할됩니다.` : `💳 ${m}개월 할부 선택됨`; } else n.classList.add('hidden'); }

function enterEditMode(id) {
  const t = transactions.find(x => x.id === id); if (!t) return; editingTxId = id; setType(t.type);
  document.getElementById('txDate').value = t.date; document.getElementById('txCategory').value = t.category; document.getElementById('txMethod').value = t.method || '신용카드'; document.getElementById('txCardCompany').value = t.cardCompany || '신한카드';
  document.getElementById('txInstallment').value = String(t.installmentMonths || 1); document.getElementById('txMerchant').value = t.merchant || ''; document.getElementById('txMemo').value = (t.memo || '').replace(/\s*\(할부\s*\d+\/\d+회차\)/g, '').trim(); document.getElementById('txAmount').value = t.amount;
  toggleCardOptions(); updateInstallmentNotice();
  document.getElementById('formCard').classList.add('border-indigo-500', 'ring-4', 'ring-indigo-50'); document.getElementById('formTitle').innerHTML = `<span class="text-indigo-600">✏️ 내역 수정 모드</span>`; document.getElementById('cancelEditBtn').classList.remove('hidden'); document.getElementById('submitBtn').textContent = '수정 완료';
  render(); document.getElementById('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function exitEditMode() {
  editingTxId = null; document.getElementById('txMerchant').value = ''; document.getElementById('txMemo').value = ''; document.getElementById('txAmount').value = ''; document.getElementById('txInstallment').value = '1'; updateInstallmentNotice();
  document.getElementById('formCard').classList.remove('border-indigo-500', 'ring-4', 'ring-indigo-50'); document.getElementById('formTitle').textContent = '✍️ 상세 내역 등록'; document.getElementById('cancelEditBtn').classList.add('hidden'); document.getElementById('submitBtn').textContent = '가계부에 등록하기'; render();
}

document.getElementById('txForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const item = { date: document.getElementById('txDate').value, type: currentType, category: document.getElementById('txCategory').value, method: document.getElementById('txMethod').value, cardCompany: document.getElementById('txCardCompany').value, installmentMonths: Number(document.getElementById('txInstallment').value), merchant: document.getElementById('txMerchant').value.trim(), memo: document.getElementById('txMemo').value.trim(), amount: Number(document.getElementById('txAmount').value) };
  if (editingTxId !== null) {
    const target = transactions.find(t => t.id === editingTxId);
    if (target) {
      const snap = { ...target }, bStr = `${target.merchant}(${target.amount.toLocaleString()}원)`, aStr = `${item.merchant}(${item.amount.toLocaleString()}원)`;
      Object.assign(target, { date: item.date, type: item.type, category: item.category, method: item.type === 'income' ? '계좌이체' : item.method, cardCompany: item.cardCompany, merchant: item.merchant, memo: item.memo, amount: item.amount });
      addChangeLog('수정', '내역 수정', `${bStr} ➔ ${aStr}`, { targetTxId: target.id, beforeStr: bStr, afterStr: aStr, undoData: { type: 'edit_single', beforeTx: snap } });
    }
    exitEditMode(); saveAndRender(); showToast('✏️ 수정되었습니다!'); return;
  }
  transactions.push(...createTransactionsWithInstallment(item));
  addChangeLog('등록', item.type === 'income' ? '수입 등록' : '지출 등록', `[${item.date.slice(5)}] ${item.merchant} ${item.amount.toLocaleString()}원`);
  saveAndRender(); exitEditMode(); showToast('✅ 등록되었습니다.');
});

function deleteTx(id) {
  const t = transactions.find(x => x.id === id); if (!t) return; if (editingTxId === id) exitEditMode();
  if (t.groupId && confirm(`[${t.merchant}] 할부 전체 회차를 삭제할까요?`)) {
    const grp = transactions.filter(x => x.groupId === t.groupId).map(x => ({ ...x })); transactions = transactions.filter(x => x.groupId !== t.groupId);
    addChangeLog('삭제', '할부 삭제', `${t.merchant} 할부 전체 삭제`, { undoData: { type: 'delete_group', txList: grp } });
  } else {
    const snap = { ...t }; transactions = transactions.filter(x => x.id !== id);
    addChangeLog('삭제', '내역 삭제', `${t.merchant} ${t.amount.toLocaleString()}원 삭제`, { undoData: { type: 'delete_single', tx: snap } });
  }
  saveAndRender(); showToast('🗑️ 삭제되었습니다.');
}

function openFixedExpenseModal() { closeHeaderMenu(); setTimeout(() => { renderFixedExpenseList(); const m = document.getElementById('fixedExpenseModal'); m.classList.remove('hidden'); m.classList.add('flex'); }, 50); }
function closeFixedExpenseModal() { const m = document.getElementById('fixedExpenseModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function renderFixedExpenseList() {
  const el = document.getElementById('fixedExpenseList'); if (!fixedExpenses.length) { el.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">등록된 고정 지출이 없습니다.</p>`; return; }
  el.innerHTML = fixedExpenses.map(i => `<div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/70 text-xs"><div><b>${i.name}</b> (${i.category}) · 매월 ${i.day}일 · <b class="text-indigo-600">${i.amount.toLocaleString()}원</b></div><button onclick="deleteFixedExpenseItem(${i.id})" class="text-slate-400 hover:text-rose-600 font-bold px-2">✕</button></div>`).join('');
}
function addFixedExpenseItem() {
  const name = document.getElementById('feName').value.trim(), category = document.getElementById('feCategory').value, day = Number(document.getElementById('feDay').value), amount = Number(document.getElementById('feAmount').value);
  if (!name || !day || !amount) return alert('모든 항목을 입력해 주세요.');
  fixedExpenses.push({ id: Date.now(), name, category, day, amount }); localStorage.setItem('argon_fixed_expenses_v3', JSON.stringify(fixedExpenses));
  document.getElementById('feName').value = ''; document.getElementById('feDay').value = ''; document.getElementById('feAmount').value = ''; renderFixedExpenseList();
}
function deleteFixedExpenseItem(id) { fixedExpenses = fixedExpenses.filter(i => i.id !== id); localStorage.setItem('argon_fixed_expenses_v3', JSON.stringify(fixedExpenses)); renderFixedExpenseList(); }
function registerAllFixedExpenses() {
  if (!fixedExpenses.length) return alert('고정 지출 항목이 없습니다.'); const ym = document.getElementById('monthFilter').value;
  fixedExpenses.forEach(fe => { const s = nextCreatedOrder(); transactions.push({ id: s, createdAt: s, date: `${ym}-${String(fe.day).padStart(2, '0')}`, type: 'expense', category: fe.category, method: '계좌이체', cardCompany: '자동이체', merchant: fe.name, memo: '고정지출 자동등록', amount: fe.amount, installmentMonths: 1, installmentCurrent: 1, installmentTotalAmount: fe.amount, groupId: null }); });
  addChangeLog('등록', '고정지출 등록', `${ym}월 고정 지출 ${fixedExpenses.length}건 등록`); closeFixedExpenseModal(); saveAndRender(); showToast(`⚡ 고정 지출 ${fixedExpenses.length}건 일괄 등록 완료!`);
}

function getTotalMonthlyBudget() { return Object.values(categoryBudgets).reduce((a, b) => a + Number(b || 0), 0); }
function openBudgetModal() { closeHeaderMenu(); setTimeout(() => { document.getElementById('budgetModalInputs').innerHTML = categories.expense.map(c => `<div class="flex items-center justify-between gap-3"><label class="text-xs font-bold w-28">${c}</label><input type="number" data-cat="${c}" oninput="updateModalTotalPreview()" value="${categoryBudgets[c] || 0}" step="10000" class="budget-input flex-1 border rounded-lg px-3 py-1.5 text-right text-sm font-bold"></div>`).join(''); updateModalTotalPreview(); const m = document.getElementById('budgetModal'); m.classList.remove('hidden'); m.classList.add('flex'); }, 50); }
function updateModalTotalPreview() { let s = 0; document.querySelectorAll('.budget-input').forEach(i => s += Number(i.value || 0)); document.getElementById('modalTotalBudgetPreview').textContent = s.toLocaleString() + '원'; }
function closeBudgetModal() { const m = document.getElementById('budgetModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function saveCategoryBudgets() { document.querySelectorAll('.budget-input').forEach(i => categoryBudgets[i.getAttribute('data-cat')] = Math.max(0, Number(i.value || 0))); localStorage.setItem('argon_cat_budgets_v3', JSON.stringify(categoryBudgets)); closeBudgetModal(); render(); showToast('🎯 예산 저장 완료!'); }

function openSyncModal() { closeHeaderMenu(); setTimeout(() => { document.getElementById('restoreCodeInput').value = ''; const m = document.getElementById('syncModal'); m.classList.remove('hidden'); m.classList.add('flex'); }, 50); }
function closeSyncModal() { const m = document.getElementById('syncModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function downloadBackupFile() { const b = new Blob([JSON.stringify({ app: 'ArgonLedgerPro', version: APP_VERSION, categoryBudgets, transactions, changeLogs }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `아르곤가계부_백업_${today}.json`; a.click(); }
function handleBackupFileUpload(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => applyBackupData(ev.target.result); r.readAsText(f); }
async function copyBackupCode() { const s = JSON.stringify({ categoryBudgets, transactions }); try { await navigator.clipboard.writeText(s); showToast('📋 백업 코드 복사 완료!'); } catch (e) { document.getElementById('restoreCodeInput').value = s; } }
function restoreFromCodeInput() { applyBackupData(document.getElementById('restoreCodeInput').value.trim()); }
function applyBackupData(raw) { try { const p = JSON.parse(raw), tx = Array.isArray(p) ? p : p.transactions; if (!Array.isArray(tx)) return alert('올바른 백업 형식이 아닙니다.'); if (document.querySelector('input[name="restoreMode"]:checked').value === 'overwrite') transactions = tx; else transactions.push(...tx); if (p.categoryBudgets) { categoryBudgets = p.categoryBudgets; localStorage.setItem('argon_cat_budgets_v3', JSON.stringify(categoryBudgets)); } saveAndRender(); closeSyncModal(); showToast('🔄 데이터 복원 완료!'); } catch (e) { alert('데이터 복원 오류'); } }

function saveAndRender() { localStorage.setItem('argon_tx_v3', JSON.stringify(transactions)); render(); }

function render() {
  const selectedMonth = document.getElementById('monthFilter').value, nextMonth = addMonthsToYM(selectedMonth, 1);
  const keyword = document.getElementById('searchInput').value.toLowerCase(), sortMode = document.getElementById('sortFilter')?.value || 'DATE_DESC';
  const catFilter = document.getElementById('categoryFilter').value, cardFilter = document.getElementById('cardFilter').value, totalBudget = getTotalMonthlyBudget();

  const monthTx = transactions.filter(t => t.date.startsWith(selectedMonth)).sort((a, b) => {
    const ac = Number(a.createdAt || a.id || 0), bc = Number(b.createdAt || b.id || 0);
    if (sortMode === 'DATE_DESC') return b.date.localeCompare(a.date) || (bc - ac);
    if (sortMode === 'CREATED_DESC') return (bc - ac) || b.date.localeCompare(a.date);
    if (sortMode === 'AMOUNT_DESC') return (b.amount - a.amount) || (bc - ac);
    return (a.amount - b.amount) || (bc - ac);
  });

  const income = monthTx.filter(t => t.type === 'income').reduce((a, c) => a + c.amount, 0);
  const expense = monthTx.filter(t => t.type === 'expense').reduce((a, c) => a + c.amount, 0);
  const balance = income - expense;
  document.getElementById('totalIncome').textContent = income.toLocaleString() + '원';
  document.getElementById('totalExpense').textContent = expense.toLocaleString() + '원';
  document.getElementById('netBalance').textContent = (balance >= 0 ? '+' : '') + balance.toLocaleString() + '원';

  const rawRatio = totalBudget > 0 ? Math.round((expense / totalBudget) * 100) : 0;
  document.getElementById('budgetStatusText').textContent = `${rawRatio}% (${expense.toLocaleString()}원)`;
  document.getElementById('budgetTotalText').textContent = `/ ${totalBudget.toLocaleString()}원`;
  document.getElementById('budgetBar').style.width = `${Math.min(rawRatio, 100)}%`;

  const todayExp = transactions.filter(t => t.date === today && t.type === 'expense'), todaySpent = todayExp.reduce((a, c) => a + c.amount, 0);
  document.getElementById('todaySpentText').textContent = todaySpent.toLocaleString() + '원';
  document.getElementById('todayCountText').textContent = `오늘 ${todayExp.length}건 결제`;
  const dayNum = new Date().getDate(), daysInM = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dailyAvg = Math.round(expense / Math.max(1, dayNum)), dailyRec = Math.max(0, Math.round((totalBudget - expense) / Math.max(1, daysInM - dayNum + 1)));
  document.getElementById('dailyAvgText').textContent = dailyAvg.toLocaleString() + '원';
  document.getElementById('dailyRecText').textContent = dailyRec.toLocaleString() + '원';

  const allInst = transactions.filter(t => t.type === 'expense' && t.installmentMonths > 1);
  const thisInst = allInst.filter(t => t.date.startsWith(selectedMonth)), nextInst = allInst.filter(t => t.date.startsWith(nextMonth)), remInst = allInst.filter(t => t.date.slice(0, 7) > selectedMonth);
  document.getElementById('instThisMonthText').textContent = thisInst.reduce((a, b) => a + b.amount, 0).toLocaleString() + '원';
  document.getElementById('instNextMonthText').textContent = nextInst.reduce((a, b) => a + b.amount, 0).toLocaleString() + '원';
  document.getElementById('instTotalRemainText').textContent = remInst.reduce((a, b) => a + b.amount, 0).toLocaleString() + '원';
  document.getElementById('installmentActiveBadge').textContent = `이번 달 ${thisInst.length}건`;
  document.getElementById('instMiniList').innerHTML = thisInst.length ? thisInst.map(t => `<div class="flex justify-between bg-indigo-50/60 dark:bg-indigo-950/50 px-2.5 py-1 rounded"><span>💳 [${t.cardCompany}] ${t.merchant} (${t.installmentCurrent}/${t.installmentMonths})</span><b class="text-rose-600">${t.amount.toLocaleString()}원</b></div>`).join('') : `<p class="text-slate-400">할부 내역이 없습니다.</p>`;

  const catSpent = {}; monthTx.filter(t => t.type === 'expense').forEach(t => catSpent[t.category] = (catSpent[t.category] || 0) + t.amount);
  document.getElementById('categoryBudgetList').innerHTML = categories.expense.map(cat => {
    const s = catSpent[cat] || 0, b = categoryBudgets[cat] || 0, pct = b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 0;
    return `<div class="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-700"><div class="flex justify-between text-xs mb-1"><b>${cat}</b><span><b class="${s > b && b > 0 ? 'text-rose-600' : 'text-indigo-600'}">사용 ${s.toLocaleString()}원</b> / 예산 ${b.toLocaleString()}원</span></div><div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div class="bg-indigo-500 h-1.5 rounded-full" style="width:${pct}%"></div></div></div>`;
  }).join('');

  const filteredTx = monthTx.filter(t => {
    const mKw = (t.merchant || '').toLowerCase().includes(keyword) || (t.memo || '').toLowerCase().includes(keyword) || (t.category || '').toLowerCase().includes(keyword) || (t.cardCompany || '').toLowerCase().includes(keyword);
    if (!mKw || (catFilter !== 'ALL' && t.category !== catFilter)) return false;
    return cardFilter === 'ALL' ? true : (cardFilter === 'INSTALLMENT' ? t.installmentMonths > 1 : t.cardCompany === cardFilter);
  });

  document.getElementById('txTotalCountBadge').textContent = `${filteredTx.length}건`;
  const tbody = document.getElementById('txList'), emptyMsg = document.getElementById('emptyListMsg');

  if (!filteredTx.length) {
    tbody.innerHTML = ''; emptyMsg.classList.remove('hidden');
  } else {
    emptyMsg.classList.add('hidden');
    const chrono = [...monthTx].sort((a, b) => a.date.localeCompare(b.date) || (Number(a.createdAt || a.id || 0) - Number(b.createdAt || b.id || 0)));
    let runBal = 0; const balMap = {};
    chrono.forEach(t => { runBal += (t.type === 'income' ? t.amount : -t.amount); balMap[t.id] = runBal; });

    const daySum = {};
    filteredTx.forEach(t => { if (!daySum[t.date]) daySum[t.date] = { inc: 0, exp: 0 }; if (t.type === 'income') daySum[t.date].inc += t.amount; else daySum[t.date].exp += t.amount; });
    const wDays = ['일', '월', '화', '수', '목', '금', '토'];

    let html = '', lastDate = null;
    filteredTx.forEach(t => {
      if (t.date !== lastDate) {
        lastDate = t.date;
        const [y, m, d] = t.date.split('-').map(Number), dow = wDays[new Date(y, m - 1, d).getDay()];
        const ds = daySum[t.date], todayBadge = t.date === today ? `<span class="ml-1.5 px-1.5 py-0.5 bg-sky-600 text-white rounded text-[10px] font-extrabold">오늘</span>` : '';
        const sums = []; if (ds.inc > 0) sums.push(`수입 <b class="text-emerald-500">${ds.inc.toLocaleString()}원</b>`); if (ds.exp > 0) sums.push(`지출 <b class="text-rose-400">${ds.exp.toLocaleString()}원</b>`);
        html += `
          <tr class="bg-slate-100/95 dark:bg-slate-800/95 border-y border-slate-200 dark:border-slate-700">
            <td colspan="5" class="py-2 px-2.5">
              <div class="flex justify-between items-center text-xs">
                <div class="font-extrabold text-slate-800 dark:text-slate-100 flex items-center"><span>${m}월 ${d}일 (${dow})</span>${todayBadge}</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">${sums.join(' · ')}</div>
              </div>
            </td>
          </tr>`;
      }
      const isEd = editingTxId === t.id, cleanCat = (t.category || '').replace(/^[^\w가-힣]+\s*/, '');
      const instTxt = t.installmentMonths > 1 ? ` · 할부 ${t.installmentCurrent}/${t.installmentMonths}` : '';
      html += `
        <tr onclick="enterEditMode(${t.id})" class="${isEd ? 'bg-indigo-50/90 dark:bg-indigo-950/80' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} cursor-pointer transition">
          <td class="py-3 px-2.5 align-top">
            <div class="text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug">
              <span class="font-extrabold">${t.merchant || '-'}</span>
              ${t.memo ? `<span class="text-slate-400 mx-1">·</span><span class="text-slate-600 dark:text-slate-300 font-medium">${t.memo}</span>` : ''}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">${cleanCat} · ${t.cardCompany || t.method}${instTxt}</div>
          </td>
          <td class="py-3 px-1.5 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap align-top font-mono">${t.type === 'income' ? t.amount.toLocaleString() : ''}</td>
          <td class="py-3 px-1.5 text-right font-bold text-rose-500 dark:text-rose-400 whitespace-nowrap align-top font-mono">${t.type === 'expense' ? t.amount.toLocaleString() : ''}</td>
          <td class="py-3 px-2 text-right font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap align-top font-mono">${(balMap[t.id] || 0).toLocaleString()}</td>
          <td class="py-3 px-1.5 text-center whitespace-nowrap align-top">
            <button type="button" onclick="event.stopPropagation(); enterEditMode(${t.id})" class="text-[11px] text-sky-500 hover:underline font-bold mr-1">수정</button>
            <button type="button" onclick="event.stopPropagation(); deleteTx(${t.id})" class="text-[11px] text-slate-300 hover:text-rose-500 font-bold">✕</button>
          </td>
        </tr>`;
    });
    tbody.innerHTML = html;
  }
  updateChart(monthTx.filter(t => t.type === 'expense')); renderLogs();
}

function updateChart(expList) {
  const ctx = document.getElementById('expenseChart').getContext('2d'), msg = document.getElementById('emptyChartMsg');
  if (!expList.length) { if (chartInstance) chartInstance.destroy(); msg.classList.remove('hidden'); return; }
  msg.classList.add('hidden'); const totals = {}; expList.forEach(t => totals[t.category] = (totals[t.category] || 0) + t.amount);
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(totals), datasets: [{ data: Object.values(totals), backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#64748b'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155' } } }, cutout: '62%' } });
}
function resetData() { closeHeaderMenu(); if (confirm('모든 거래 내역을 초기화하시겠습니까?')) { transactions = []; saveAndRender(); } }
function exportCSV() { closeHeaderMenu(); if (!transactions.length) return alert('내역이 없습니다.'); let c = '\uFEFF날짜,구분,카테고리,결제수단,카드사,사용처,내용,금액\n'; transactions.forEach(t => c += `${t.date},${t.type === 'income' ? '수입' : '지출'},${t.category},${t.method},${t.cardCompany},"${t.merchant}","${t.memo}",${t.amount}\n`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: 'text/csv;charset=utf-8;' })); a.download = `아르곤가계부_${document.getElementById('monthFilter').value}.csv`; a.click(); }

document.getElementById('monthFilter').addEventListener('change', () => { exitEditMode(); render(); });
document.getElementById('txDate').value = today; document.getElementById('monthFilter').value = currentYearMonth; document.getElementById('todayDateBadge').textContent = `(${today.slice(5).replace('-', '/')})`;
initDarkMode(); setType('expense'); toggleCardOptions(); render(); checkVersionUpdatePopup(); checkIncomingSharedSMS();

const state = {
  user: null,
  page: 'home',
  authMode: 'login',
  pendingEmail: '',
  devCode: '',
  dashboard: null,
  wallet: null,
  admin: null,
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const money = (value) => `${window.CLIZORA_CURRENCY || '$'}${Number(value || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const number = (value) => Number(value || 0).toLocaleString('en-US');
const dateTime = (value) => new Date(value).toLocaleString();
const dateOnly = (value) => new Date(value).toLocaleDateString();
const percent = (part,total) => total > 0 ? Math.min(100,Math.max(0,part/total*100)) : 0;

async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

let toastTimer;
function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = isError ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = ''; }, 3000);
}

function initials(name) {
  return String(name || 'C').split(/\s+/).slice(0,2).map((part)=>part[0] || '').join('').toUpperCase();
}

function statusPill(value) {
  const label = value === 'request' ? 'Payout pending' : value;
  return `<span class="status ${esc(value)}">${esc(label)}</span>`;
}

function externalLink(url, label) {
  if (!url) return '<span class="muted">—</span>';
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label || url)}</a>`;
}

const NAV = {
  creator: [ ['home','⌂','Overview'], ['campaigns','▣','Campaigns'], ['review','✓','Review'], ['wallet','◈','Wallet'], ['profile','◎','Profile'] ],
  clipper: [ ['home','⌂','Overview'], ['find','⌕','Find campaigns'], ['clips','▤','My clips'], ['wallet','◈','Wallet'], ['profile','◎','Profile'] ],
  admin: [ ['home','⌂','Overview'], ['campaigns','▣','Campaigns'], ['users','♙','Users'], ['submissions','▤','Submissions'], ['payments','◈','Payments'] ]
};

async function loadData() {
  const dashboard = await api('/dashboard');
  state.user = dashboard.user;
  state.dashboard = dashboard;
  if (state.user.role === 'creator' || state.user.role === 'clipper') {
    state.wallet = await api('/wallet');
  }
  if (state.user.role === 'admin') {
    state.admin = await api('/admin/overview');
  }
}

async function refresh() {
  try {
    await loadData();
    render();
  } catch (error) {
    if (/log in|session has expired|account not found/i.test(error.message)) {
      state.user = null;
      state.dashboard = null;
      render();
    } else toast(error.message, true);
  }
}

function authScreen() {
  const signingUp = state.authMode === 'signup';
  const verifying = Boolean(state.pendingEmail);
  const content = verifying ? `
    <h2>Verify your email</h2>
    <p class="muted">Enter the 6-digit code sent to <strong>${esc(state.pendingEmail)}</strong>.</p>
    ${state.devCode ? `<div class="demo-box"><strong>Development preview code</strong>Your email service is not connected, so use <b>${esc(state.devCode)}</b>. In production, this code is sent by email.</div>` : ''}
    <form data-form="verify-otp">
      <div class="field"><label for="otp-code">Verification code</label><input id="otp-code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Enter 6-digit code" required></div>
      <button class="button full" type="submit">Verify and create account</button>
    </form>
    <p class="auth-note" style="text-align:center;margin-top:15px">Code expires in 5 minutes. <button class="text-button" data-action="cancel-otp">Start again</button></p>
  ` : signingUp ? `
    <h2>Create your account</h2>
    <p class="muted">Join Clizora as a creator or a clipper.</p>
    <form data-form="register">
      <div class="field"><label>Account type</label><select name="role"><option value="creator">I'm a creator</option><option value="clipper">I'm a clipper</option></select></div>
      <div class="field"><label>Full name</label><input name="name" placeholder="Your name" minlength="2" maxlength="80" required></div>
      <div class="field"><label>Email address</label><input name="email" type="email" placeholder="you@example.com" required></div>
      <div class="grid-two">
        <div class="field"><label>Age</label><input name="age" type="number" min="13" max="100" placeholder="Age" required></div>
        <div class="field"><label>Password</label><input name="password" type="password" minlength="8" placeholder="8+ characters" required></div>
      </div>
      <div class="field"><label>Your social profile URL</label><input name="handle" type="url" placeholder="https://youtube.com/@yourchannel" required><small>YouTube, Instagram or TikTok profile links are supported in this prototype.</small></div>
      <button class="button full" type="submit">Create account</button>
    </form>
  ` : `
    <h2>Welcome back</h2>
    <p class="muted">Log in to manage campaigns, clips and payouts.</p>
    <form data-form="login">
      <div class="field"><label>Email address</label><input name="email" type="email" placeholder="you@example.com" required></div>
      <div class="field"><label>Password</label><input name="password" type="password" placeholder="Your password" required></div>
      <button class="button full" type="submit">Log in to Clizora</button>
    </form>
  `;

  return `
    <div class="auth-layout">
      <section class="auth-hero">
        <div class="brand"><span class="brand-mark">▶</span><span class="brand-word">Clizora</span></div>
        <div class="hero-copy">
          <div class="eyebrow" style="color:#9de9f2">Creator × clipper marketplace</div>
          <h1>Turn long videos into short-form momentum.</h1>
          <p>Creators launch campaigns. Clippers publish the best moments. Approved clips can earn as they reach view milestones.</p>
          <ul class="hero-points">
            <li><span>✓</span> Creators set campaign requirements and a per-1,000-view rate.</li>
            <li><span>✓</span> Clippers discover campaigns and submit their published clips.</li>
            <li><span>✓</span> Approved clip earnings are tracked against campaign budgets.</li>
          </ul>
        </div>
        <div class="hero-footer">Clizora prototype · Payments and platform analytics are in demo mode</div>
      </section>
      <section class="auth-panel">
        <div class="auth-box">
          ${verifying ? content : `
            <div class="auth-switch"><button class="${!signingUp?'active':''}" data-action="auth-mode" data-mode="login">Log in</button><button class="${signingUp?'active':''}" data-action="auth-mode" data-mode="signup">Sign up</button></div>
            ${content}
            <div class="demo-box">
              <strong>Try the demo accounts</strong>
              <div class="demo-links">
                <button data-action="demo-login" data-email="demo.creator@gmail.com" data-password="demo1234">Creator demo</button>
                <button data-action="demo-login" data-email="demo.clipper@gmail.com" data-password="demo1234">Clipper demo</button>
                <button data-action="demo-login" data-email="admin@clizora.app" data-password="admin123">Admin demo</button>
              </div>
            </div>
          `}
        </div>
      </section>
    </div>
  `;
}

function statCard(label, value, highlight = false) {
  return `<div class="stat-card ${highlight?'highlight':''}"><small>${esc(label)}</small><strong>${value}</strong></div>`;
}

function campaignRow(c, withActions = false, allowSubmit = false) {
  const progress = percent(c.spent,c.budget);
  let actions = '';
  if (withActions && c.status !== 'ended') {
    actions = `<div class="item-actions">
      <button class="button secondary small" data-action="campaign-status" data-id="${esc(c.id)}" data-status="${c.status==='active'?'paused':'active'}">${c.status==='active'?'Pause':'Resume'}</button>
      <button class="button danger small" data-action="campaign-status" data-id="${esc(c.id)}" data-status="ended">End &amp; refund</button>
    </div>`;
  }
  if (allowSubmit && c.status === 'active') {
    actions = `<form class="inline-form" data-form="submit-clip"><input type="hidden" name="campaignId" value="${esc(c.id)}"><input name="clipUrl" type="url" placeholder="Paste your published clip URL" required><button class="button small" type="submit">Submit clip</button></form>`;
  }
  return `<div class="item-row"><div class="item-main">
    <strong>${esc(c.title)}</strong> ${statusPill(c.status)}
    <div class="progress"><span style="width:${progress}%"></span></div>
    <small>${number(c.views || 0)} views · ${money(c.spent)} of ${money(c.budget)} used · ${money(c.rate)} / 1K views${c.creatorName?` · by ${esc(c.creatorName)}`:''}</small>
    <small>Source: ${externalLink(c.sourceUrl,'Open source video')}</small>
    ${allowSubmit ? `<div class="requirements">${esc(c.brief)}</div>` : ''}
    ${actions}
  </div>${withActions && !actions ? '' : ''}</div>`;
}

function submissionRow(s, review = false) {
  const reviewControls = review && s.status === 'pending' ? `
    <form class="inline-form" data-form="review-submission">
      <input type="hidden" name="submissionId" value="${esc(s.id)}">
      <input name="feedback" placeholder="Optional feedback">
      <button class="button small" name="status" value="approved" type="submit">Approve</button>
      <button class="button secondary small" name="status" value="rejected" type="submit">Reject</button>
    </form>` : '';
  return `<div class="item-row"><div class="item-main">
    <strong>${externalLink(s.clipUrl,'Open submitted clip')}</strong> ${statusPill(s.status)}
    <small>${esc(s.clipperName || 'Clipper')} · ${esc(s.campaignTitle)} · ${number(s.views)} views · ${money(s.paid)} earned</small>
    ${review ? `<small>Channel: ${externalLink(s.clipperHandle,'Open profile')} · Age: ${esc(s.clipperAge ?? '—')} · submitted ${esc(dateTime(s.createdAt))}</small>` : ''}
    ${s.feedback ? `<div class="requirements">Feedback: ${esc(s.feedback)}</div>` : ''}
    ${reviewControls}
  </div></div>`;
}

function transactionRows(transactions) {
  if (!transactions?.length) return '<div class="empty">No transactions yet.</div>';
  return transactions.map((t)=>`<div class="item-row"><div class="item-main"><strong>${esc(t.note)}</strong><small>${esc(dateTime(t.createdAt))} · ${esc(t.type)}</small></div><div style="text-align:right"><strong class="${t.amount < 0 ? 'money-negative' : 'money-positive'}">${t.amount < 0 ? '−' : '+'}${money(Math.abs(t.amount))}</strong><br>${statusPill(t.status)}</div></div>`).join('');
}

function creatorPage() {
  const d = state.dashboard;
  const s = d.stats;
  if (state.page === 'home') {
    const latest = d.campaigns.slice(0,4);
    const topClips = [...d.submissions].filter(x=>x.status==='approved').sort((a,b)=>b.views-a.views).slice(0,5);
    return `<div class="stats-grid">
      ${statCard('Available wallet',money(s.wallet),true)}${statCard('Campaign views',number(s.views))}${statCard('Live campaigns',number(s.liveCampaigns))}${statCard('Awaiting review',number(s.awaitingReview))}
    </div><div class="content-grid">
      <section class="panel"><div class="panel-head"><h3>Recent campaigns</h3><button class="text-button" data-action="navigate" data-page="campaigns">View all</button></div>${latest.length?latest.map(c=>campaignRow(c)).join(''):'<div class="empty">No campaigns yet. Create your first campaign.</div>'}</section>
      <section class="panel"><h3>Top performing clips</h3>${topClips.length?topClips.map(s=>submissionRow(s)).join(''):'<div class="empty">Approved clips will appear here.</div>'}</section>
    </div><section class="panel"><h3>Recent transactions</h3>${transactionRows(d.transactions)}</section>`;
  }
  if (state.page === 'campaigns') {
    return `<section class="panel"><h3>Launch a campaign</h3><p class="muted">Set your source video, clipping requirements and payment rate. The full budget is reserved from your demo wallet.</p>
      <form data-form="create-campaign">
        <div class="field"><label>Campaign title</label><input name="title" placeholder="Example: Podcast episode highlights" minlength="3" maxlength="120" required></div>
        <div class="field"><label>Source video URL</label><input name="sourceUrl" type="url" placeholder="https://youtube.com/watch?v=..." required></div>
        <div class="field"><label>Clipping requirements</label><textarea name="brief" minlength="10" maxlength="2000" placeholder="Clip length, format, captions, hooks, tags and publishing requirements..." required></textarea></div>
        <div class="grid-two"><div class="field"><label>Pay per 1,000 views ($)</label><input name="rate" type="number" min="0.01" step="0.01" placeholder="2.50" required></div><div class="field"><label>Total campaign budget ($)</label><input name="budget" type="number" min="1" step="0.01" placeholder="300.00" required></div></div>
        <button class="button" type="submit">Reserve budget &amp; launch</button>
      </form>
    </section><section class="panel"><h3>Your campaigns</h3>${d.campaigns.length?d.campaigns.map(c=>campaignRow(c,true)).join(''):'<div class="empty">You have not launched a campaign yet.</div>'}</section>`;
  }
  if (state.page === 'review') {
    const pending = d.submissions.filter(s=>s.status==='pending');
    const reviewed = d.submissions.filter(s=>s.status!=='pending');
    return `<section class="panel"><h3>Waiting for your review (${pending.length})</h3>${pending.length?pending.map(s=>submissionRow(s,true)).join(''):'<div class="empty">Nothing to review. You are all caught up.</div>'}</section><section class="panel"><h3>Reviewed submissions</h3>${reviewed.length?reviewed.map(s=>submissionRow(s,true)).join(''):'<div class="empty">Approved and rejected clips will be listed here.</div>'}</section>`;
  }
  if (state.page === 'wallet') return walletPage();
  return profilePage();
}

function clipperPage() {
  const d = state.dashboard;
  const s = d.stats;
  if (state.page === 'home') {
    const joined = new Set(d.submissions.map(x=>x.campaignId));
    return `<div class="stats-grid">${statCard('Available balance',money(s.wallet),true)}${statCard('Total earned',money(s.earned))}${statCard('Views generated',number(s.views))}${statCard('Campaigns joined',number(s.joined))}</div>
      <div class="content-grid"><section class="panel"><div class="panel-head"><h3>Open campaigns</h3><button class="text-button" data-action="navigate" data-page="find">Explore</button></div>${d.campaigns.filter(c=>c.status==='active').slice(0,4).map(c=>campaignRow(c)).join('')||'<div class="empty">No live campaigns are available right now.</div>'}</section>
      <section class="panel"><h3>Campaigns you have joined</h3>${d.campaigns.filter(c=>joined.has(c.id)).map(c=>campaignRow(c)).join('')||'<div class="empty">Submit a clip to join a campaign.</div>'}</section></div>
      <section class="panel"><h3>Recent submissions</h3>${d.submissions.slice(0,5).map(s=>submissionRow(s)).join('')||'<div class="empty">Your clip submissions will appear here.</div>'}</section>`;
  }
  if (state.page === 'find') {
    return `<p class="page-intro">Browse active creator campaigns. Read the requirements before posting and submitting your clip.</p><section class="panel"><h3>Open campaigns (${d.campaigns.length})</h3>${d.campaigns.length?d.campaigns.map(c=>campaignRow(c,false,true)).join(''):'<div class="empty">No live campaigns yet. Check again later.</div>'}</section>`;
  }
  if (state.page === 'clips') {
    return `<section class="panel"><h3>My submissions</h3>${d.submissions.length?`<div class="table-wrap"><table><thead><tr><th>Clip</th><th>Campaign</th><th>Review</th><th>Views</th><th>Earned</th></tr></thead><tbody>${d.submissions.map(s=>`<tr><td>${externalLink(s.clipUrl,'Open clip')}</td><td>${esc(s.campaignTitle)}</td><td>${statusPill(s.status)}</td><td>${number(s.views)}</td><td>${money(s.paid)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">You have not submitted any clips yet.</div>'}</section>`;
  }
  if (state.page === 'wallet') return walletPage();
  return profilePage();
}

function walletPage() {
  const user = state.user;
  const wallet = state.wallet || { balance: user.wallet, transactions: [] };
  const isCreator = user.role === 'creator';
  const stats = state.dashboard.stats;
  return `<div class="stats-grid">${statCard('Current balance',money(wallet.balance),true)}${isCreator?statCard('Campaign payouts',money(stats.paid)):statCard('Total earned',money(stats.earned))}${statCard('Transactions',number(wallet.transactions.length))}${statCard('Account type',esc(user.role))}</div>
    <div class="content-grid"><section class="panel"><h3>${isCreator?'Add demo funds':'Request a payout'}</h3>
      ${isCreator?`<p class="muted">This checkout is simulated for the prototype. No real payment is collected.</p><form data-form="demo-deposit"><div class="field"><label>Amount ($)</label><input name="amount" type="number" min="1" max="10000" step="0.01" placeholder="100.00" required></div><div class="field"><label>Payment method (demo)</label><select name="method"><option>UPI demo</option><option>Card demo</option><option>Bank transfer demo</option></select></div><button class="button" type="submit">Add demo funds</button></form>`:
      `<p class="muted">Payout requests are reviewed manually by the Clizora admin in this prototype.</p><form data-form="payout-request"><div class="field"><label>Amount ($)</label><input name="amount" type="number" min="1" step="0.01" placeholder="10.00" required></div><div class="field"><label>Payout method</label><select name="method"><option>UPI</option><option>Bank transfer</option><option>PayPal</option></select></div><div class="field"><label>Payment destination</label><input name="destination" placeholder="UPI ID / bank details / PayPal email" required></div><button class="button" type="submit">Request payout</button></form>`}
    </section><section class="panel"><h3>Wallet notes</h3><div class="requirements">Creator budgets are reserved in campaign escrow when a campaign launches. Ending a campaign returns the unused budget to the creator wallet.</div><div class="requirements">Clipper earnings are added after an approved clip reaches eligible 1,000-view milestones, subject to the remaining campaign budget.</div><div class="requirements">Real deposits and withdrawals are not enabled. Connect a payment provider and complete operational/legal checks before production.</div></section></div>
    <section class="panel"><h3>Transaction history</h3>${transactionRows(wallet.transactions)}</section>`;
}

function profilePage() {
  const u = state.user;
  return `<section class="panel"><h3>Your profile</h3><div class="profile-grid"><span>Name</span><strong>${esc(u.name)}</strong></div><div class="profile-grid"><span>Account type</span><strong style="text-transform:capitalize">${esc(u.role)}</strong></div><div class="profile-grid"><span>Email</span><strong>${esc(u.email)}</strong></div><div class="profile-grid"><span>Age</span><strong>${esc(u.age)}</strong></div><div class="profile-grid"><span>Social profile</span><strong>${externalLink(u.handle,u.handle)}</strong></div><div class="profile-grid"><span>Account status</span><strong>${u.banned?'Suspended':'Active'}</strong></div></section>`;
}

function adminPage() {
  const d = state.admin;
  if (!d) return '<div class="empty">Loading admin data...</div>';
  if (state.page === 'home') {
    const s = d.stats;
    return `<div class="stats-grid">${statCard('Creators',number(s.creators),true)}${statCard('Clippers',number(s.clippers))}${statCard('Active campaigns',number(s.activeCampaigns))}${statCard('Total views',number(s.views))}</div>
      <div class="stats-grid">${statCard('Paid to clippers',money(s.paidToClippers))}${statCard('Held in escrow',money(s.heldEscrow))}${statCard('Pending payouts',number(s.pendingPayouts))}${statCard('Registered users',number(d.users.length))}</div>
      <div class="content-grid"><section class="panel"><h3>Latest campaigns</h3>${d.campaigns.slice(0,5).map(c=>campaignRow(c)).join('')||'<div class="empty">No campaigns yet.</div>'}</section><section class="panel"><h3>Latest submissions</h3>${d.submissions.slice(0,5).map(s=>submissionRow(s)).join('')||'<div class="empty">No clip submissions yet.</div>'}</section></div>`;
  }
  if (state.page === 'campaigns') return `<section class="panel"><h3>All campaigns</h3>${d.campaigns.map(c=>campaignRow(c,true)).join('')||'<div class="empty">No campaigns yet.</div>'}</section>`;
  if (state.page === 'users') return `<section class="panel"><h3>Registered users (${d.users.length})</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Profile</th><th>Wallet</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td>${esc(u.email)}</td><td>${externalLink(u.handle,'Open')}</td><td>${money(u.wallet)}</td><td>${u.banned?statusPill('rejected'):statusPill('active')}</td><td><button class="button ${u.banned?'secondary':'danger'} small" data-action="ban-user" data-id="${esc(u.id)}">${u.banned?'Reinstate':'Suspend'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
  if (state.page === 'submissions') return `<section class="panel"><h3>All submissions</h3>${d.submissions.map(s=>`<div class="item-row"><div class="item-main"><strong>${externalLink(s.clipUrl,'Open clip')}</strong> ${statusPill(s.status)}<small>${esc(s.clipperName)} · ${esc(s.campaignTitle)} · ${number(s.views)} views · ${money(s.paid)} paid</small></div>${state.dashboard?.demoMode ? `<form class="item-actions" data-form="test-views"><input type="hidden" name="submissionId" value="${esc(s.id)}"><input class="compact-input" type="number" name="views" min="${s.views}" value="${s.views}" aria-label="Set demo view count"><button class="button secondary small" type="submit">Set test views</button></form>`:''}</div>`).join('')||'<div class="empty">No submissions yet.</div>'}<p class="auth-note">Test view controls only update demo data. They do not read real platform analytics.</p></section>`;
  if (state.page === 'payments') return `<section class="panel"><h3>Payout requests (${d.payouts.length})</h3>${d.payouts.length?d.payouts.map(p=>`<div class="item-row"><div class="item-main"><strong>${esc(p.userName)} · ${money(p.amount)}</strong><small>${esc(p.note)} · requested ${esc(dateTime(p.createdAt))}</small></div><div class="item-actions"><button class="button small" data-action="payout-decision" data-id="${esc(p.id)}" data-decision="paid">Mark paid</button><button class="button danger small" data-action="payout-decision" data-id="${esc(p.id)}" data-decision="reject">Reject</button></div></div>`).join(''):'<div class="empty">No pending payouts.</div>'}</section>`;
  return '<div class="empty">Page not found.</div>';
}

function render() {
  const root = $('#app');
  if (!state.user) { root.innerHTML = authScreen(); return; }
  const role = state.user.role;
  const menu = NAV[role] || NAV.clipper;
  const item = menu.find(x=>x[0]===state.page) || menu[0];
  if (!menu.some(x=>x[0]===state.page)) state.page = menu[0][0];
  let pageHtml = role === 'creator' ? creatorPage() : role === 'clipper' ? clipperPage() : adminPage();
  root.innerHTML = `<div class="app-shell">
    <aside class="sidebar"><div class="brand"><span class="brand-mark">▶</span><span class="brand-word">Clizora</span></div>
      <div class="nav-label">Workspace</div><nav class="nav-list">${menu.map(([key,icon,label])=>`<button class="nav-item ${state.page===key?'active':''}" data-action="navigate" data-page="${key}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="user-mini"><div class="avatar">${esc(initials(state.user.name))}</div><div><strong>${esc(state.user.name)}</strong><small>${esc(role)} account</small></div></div></div>
    </aside>
    <main class="main-area"><header class="topbar"><div class="mobile-brand brand"><span class="brand-mark">▶</span><span class="brand-word">Clizora</span></div><h1>${esc(item[2])}</h1><span class="topbar-note">${esc(state.user.name)}</span><button class="button secondary small" data-action="logout">Log out</button></header>${pageHtml}</main>
  </div>`;
}

async function perform(action) {
  if (state.busy) return;
  state.busy = true;
  try { await action(); }
  catch (error) { toast(error.message || 'Something went wrong.', true); }
  finally { state.busy = false; }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'auth-mode') { state.authMode = button.dataset.mode; render(); }
  if (action === 'cancel-otp') { state.pendingEmail=''; state.devCode=''; state.authMode='signup'; render(); }
  if (action === 'navigate') { state.page = button.dataset.page; render(); }
  if (action === 'logout') perform(async()=>{ await api('/auth/logout',{method:'POST'}); state.user=null; state.dashboard=null; state.wallet=null; state.admin=null; state.page='home'; state.authMode='login'; render(); });
  if (action === 'demo-login') perform(async()=>{
    const result = await api('/auth/login',{method:'POST',body:JSON.stringify({email:button.dataset.email,password:button.dataset.password})});
    state.user = result.user; state.page='home'; await refresh();
  });
  if (action === 'campaign-status') perform(async()=>{ await api(`/campaigns/${encodeURIComponent(button.dataset.id)}/status`,{method:'PATCH',body:JSON.stringify({status:button.dataset.status})}); await refresh(); toast('Campaign updated.'); });
  if (action === 'ban-user') perform(async()=>{ await api(`/admin/users/${encodeURIComponent(button.dataset.id)}/ban`,{method:'PATCH'}); await refresh(); toast('User status updated.'); });
  if (action === 'payout-decision') perform(async()=>{ await api(`/admin/payouts/${encodeURIComponent(button.dataset.id)}`,{method:'PATCH',body:JSON.stringify({action:button.dataset.decision})}); await refresh(); toast('Payout updated.'); });
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const formType = form.dataset.form;
  const submitter = event.submitter;
  if (formType === 'review-submission' && submitter?.name === 'status') data.status = submitter.value;

  perform(async()=>{
    if (formType === 'login') {
      const result = await api('/auth/login',{method:'POST',body:JSON.stringify(data)});
      state.user=result.user; state.page='home'; await refresh(); toast('Welcome back.');
    } else if (formType === 'register') {
      const result = await api('/auth/register',{method:'POST',body:JSON.stringify(data)});
      state.pendingEmail=String(data.email).trim().toLowerCase();
      state.devCode=result.developmentCode || '';
      render(); toast(result.message);
    } else if (formType === 'verify-otp') {
      const result = await api('/auth/verify-otp',{method:'POST',body:JSON.stringify({email:state.pendingEmail,code:data.code})});
      state.user=result.user; state.pendingEmail=''; state.devCode=''; state.page='home'; await refresh(); toast('Your account is ready.');
    } else if (formType === 'create-campaign') {
      await api('/campaigns',{method:'POST',body:JSON.stringify(data)}); await refresh(); toast('Campaign launched.');
    } else if (formType === 'submit-clip') {
      await api('/submissions',{method:'POST',body:JSON.stringify(data)}); await refresh(); toast('Clip submitted for review.');
    } else if (formType === 'review-submission') {
      await api(`/submissions/${encodeURIComponent(data.submissionId)}/review`,{method:'PATCH',body:JSON.stringify({status:data.status,feedback:data.feedback})}); await refresh(); toast('Review saved.');
    } else if (formType === 'demo-deposit') {
      await api('/wallet/demo-deposit',{method:'POST',body:JSON.stringify(data)}); await refresh(); toast('Demo funds added. No real payment was processed.');
    } else if (formType === 'payout-request') {
      await api('/wallet/payout-request',{method:'POST',body:JSON.stringify(data)}); await refresh(); toast('Payout request submitted.');
    } else if (formType === 'test-views') {
      await api(`/admin/submissions/${encodeURIComponent(data.submissionId)}/test-views`,{method:'POST',body:JSON.stringify({views:Number(data.views)})}); await refresh(); toast('Demo view count saved.');
    }
  });
});

(async function boot(){
  try { await loadData(); }
  catch (_error) { state.user=null; }
  render();
})();

// ========================================================
// FLUX HAVEN CORE ENGINE — SINGLE SOURCE OF TRUTH
// ========================================================
const SUPABASE_URL = 'https://wepwkictsluowcdxhtiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcHdraWN0c2x1b3djZHhodGl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDUzMDcsImV4cCI6MjA5NzgyMTMwN30.zjZAy2x7ifhhSKBgNZYD3ZsRnT2Nlfb4gK5fG7ulAO8';

let supabase;
function initSupabase() {
    if (window.supabase && !supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return !!supabase;
}
initSupabase();

// ========================================================
// AUTHORITATIVE VIP CONFIGURATION (VIP1 — VIP6 ACTIVE, VIP7 — VIP9 LOCKED)
// ========================================================
const VIP_CONFIG = {
    1: { name: 'VIP1', cost: 16000, daily_reward: 760, tasks_per_day: 4, reward_per_task: 190, fixed_withdrawal: 2000, monthly: 22800, yearly: 273600, locked: false },
    2: { name: 'VIP2', cost: 50000, daily_reward: 1665, tasks_per_day: 5, reward_per_task: 333, fixed_withdrawal: 10000, monthly: 49950, yearly: 599400, locked: false },
    3: { name: 'VIP3', cost: 80000, daily_reward: 2664, tasks_per_day: 6, reward_per_task: 444, fixed_withdrawal: 20000, monthly: 79920, yearly: 959040, locked: false },
    4: { name: 'VIP4', cost: 150000, daily_reward: 4998, tasks_per_day: 6, reward_per_task: 833, fixed_withdrawal: 50000, monthly: 149940, yearly: 1799280, locked: false },
    5: { name: 'VIP5', cost: 250000, daily_reward: 8336, tasks_per_day: 8, reward_per_task: 1042, fixed_withdrawal: 100000, monthly: 250080, yearly: 3000960, locked: false },
    6: { name: 'VIP6', cost: 320000, daily_reward: 10664, tasks_per_day: 8, reward_per_task: 1333, fixed_withdrawal: 500000, monthly: 319920, yearly: 3839040, locked: false },
    7: { name: 'VIP7', cost: 530000, daily_reward: 20400, tasks_per_day: 20, reward_per_task: 1475, fixed_withdrawal: 1000000, monthly: 530400, yearly: 6364800, locked: true },
    8: { name: 'VIP8', cost: 800000, daily_reward: 31000, tasks_per_day: 16, reward_per_task: 2200, fixed_withdrawal: 1000000, monthly: 806000, yearly: 9672000, locked: true },
    9: { name: 'VIP9', cost: 1500000, daily_reward: 57800, tasks_per_day: 20, reward_per_task: 3340, fixed_withdrawal: 3000000, monthly: 1502800, yearly: 18033600, locked: true }
};

let vipTiers = [];

async function loadVipTiers() {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase
            .from('vip_tiers')
            .select('*')
            .order('level', { ascending: true });
        
        if (!error && data && data.length > 0) {
            vipTiers = data
                .filter(t => t.level >= 1 && t.level <= 9)
                .map(tier => {
                    const cfg = VIP_CONFIG[tier.level];
                    return cfg ? { ...tier, ...cfg } : tier;
                });
        } else {
            vipTiers = Object.keys(VIP_CONFIG).map(lvl => ({ level: parseInt(lvl), ...VIP_CONFIG[lvl] }));
        }
    } catch (e) {
        vipTiers = Object.keys(VIP_CONFIG).map(lvl => ({ level: parseInt(lvl), ...VIP_CONFIG[lvl] }));
    }
    return vipTiers;
}

function getActiveVipTier(user) {
    if (!user || !vipTiers || vipTiers.length === 0) return null;
    const level = parseInt(user.current_plan_id || 0);
    if (level >= 1 && level <= 9) {
        return vipTiers.find(t => t.level === level) || null;
    }
    return null;
}

let currentUser = null;
let appSettings = null;
let selectedVipTier = null;
let selectedPayableAmount = 0;
let realtimeChannel = null;
let telegramPopupShown = false;
let currentHistoryFilter = 'all';
let isTaskExecuting = false;

// Active Task Session State
let activeTaskSession = null;
let taskAnimFrameId = null;

function fmt(num) { return (Number(num) || 0).toLocaleString('en-NG'); }

function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Sunday complete restriction helper
function isSunday() {
    return new Date().getDay() === 0;
}

// Friday only restriction helper for withdrawals
function isFriday() {
    return new Date().getDay() === 5;
}

// ========================================================
// TOAST NOTIFICATIONS & PROGRESS LOADERS
// ========================================================
function showToast(msg) {
    const old = document.getElementById('customToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'customToast';
    t.className = 'toast-animate fixed bottom-24 left-1/2 -translate-x-1/2 bg-navy-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl border border-blue-500/30 z-[99999] text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center gap-2 backdrop-blur-xl';
    t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translate(-50%, 20px) scale(0.96)';
        t.style.transition = 'all 0.25s ease';
        setTimeout(() => t.remove(), 250);
    }, 3200);
}

function toggleLoader(show, text = 'Processing...') {
    const loader = document.getElementById('loadingOverlay');
    document.getElementById('loadingText').textContent = text;
    if (show) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    else { loader.classList.add('hidden'); loader.classList.remove('flex'); }
}

// ========================================================
// SPA NAVIGATION & MICRO-LOADERS
// ========================================================
let _navLoadingActive = false;
const NAV_MESSAGES = {
    homePage: ['Synchronizing Client Overview...', 'Refreshing Portfolios...'],
    tasksPage: ['Opening Task Center...', 'Syncing Quota...'],
    depositPage: ['Preparing Settlement Hub...', 'Fetching VIP Allocation...'],
    withdrawPage: ['Checking Available Liquidity...', 'Verifying Limits...'],
    historyPage: ['Retrieving Ledger Logs...', 'Verifying Records...'],
    profilePage: ['Loading Account Portfolio...', 'Securing Bank Details...'],
    referralPage: ['Calculating Network Matrix...', 'Retrieving Tier Roster...'],
    wealthCenterPage: ['Opening F/H Wealth Center...', 'Loading Maturity Portfolio...'],
    luckyHeartPage: ['Preparing Lucky Heart...', 'Checking Daily Spin Entitlement...'],
    adminPage: ['Entering Root Control...', 'Verifying Administrative Signature...'],
};

function showNavLoader(targetPage, callback) {
    if (_navLoadingActive) { callback(); return; }
    _navLoadingActive = true;
    const msgs = NAV_MESSAGES[targetPage] || ['Authorizing Request...'];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    const delay = 450;

    document.getElementById('navOverlayText').textContent = msg;
    const bar = document.getElementById('navProgressBar');
    bar.style.transition = 'none'; bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = `width ${delay}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    bar.style.width = '100%';

    const ov = document.getElementById('navOverlay');
    ov.classList.remove('hidden'); ov.classList.add('flex');
    setTimeout(() => {
        ov.classList.add('hidden'); ov.classList.remove('flex');
        _navLoadingActive = false;
        callback();
    }, delay);
}

const VIEWS = ['authPage', 'homePage', 'tasksPage', 'depositPage', 'withdrawPage', 'historyPage', 'profilePage', 'referralPage', 'wealthCenterPage', 'luckyHeartPage', 'adminPage'];

function switchView(targetId) {
    VIEWS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { 
            el.classList.toggle('hidden', id !== targetId); 
            el.classList.toggle('flex', id === targetId); 
        }
    });
    window.scrollTo(0, 0);
    const nav = document.getElementById('bottomNav');
    if (targetId === 'authPage' || targetId === 'adminPage') {
        nav.classList.add('hidden');
    } else {
        nav.classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === targetId);
        });
    }
}

function navigateTo(page) {
    if (!currentUser) return;
    if (_navLoadingActive) return;
    if (page === 'adminPage' && currentUser.role !== 'admin') {
        return showToast('🔒 Root administrative access required');
    }
    if ((page === 'wealthCenterPage' || page === 'luckyHeartPage') && !getActiveNewFeatureVipTier(currentUser)) {
        return showToast('🔒 An active VIP1–VIP6 plan is required for this feature.');
    }
    if (page !== 'profilePage' && page !== 'homePage' && page !== 'adminPage' && page !== 'historyPage' && page !== 'referralPage' && page !== 'tasksPage' && page !== 'wealthCenterPage' && page !== 'luckyHeartPage' &&
        (!currentUser.bank_name || !currentUser.account_number)) {
        showToast('⚠️ Please link your settlement bank details in Profile first');
        showNavLoader('profilePage', () => switchView('profilePage'));
        return;
    }
    showNavLoader(page, () => {
        if (page === 'tasksPage') prepareTasksView();
        if (page === 'historyPage') loadHistory();
        if (page === 'withdrawPage') prepareWithdrawalView();
        if (page === 'adminPage') loadAdminData();
        if (page === 'profilePage') prepareProfileView();
        if (page === 'depositPage') prepareDepositView();
        if (page === 'referralPage') loadReferralTracking();
        if (page === 'wealthCenterPage') loadWealthCenterPage();
        if (page === 'luckyHeartPage') loadLuckyHeartPage();
        switchView(page);
    });
}
function goBackToHome() {
    showNavLoader('homePage', () => {
        switchView('homePage');
        updateDashboardUI();
    });
}

function navBottom(page) {
    if (page === 'homePage') goBackToHome();
    else navigateTo(page);
}

function toggleLoginPassword() {
    const input = document.getElementById('loginPassword');
    const icon = document.getElementById('loginPasswordEyeIcon');
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'ph ph-eye-slash text-xl';
    } else {
        input.type = 'password';
        icon.className = 'ph ph-eye text-xl';
    }
}

// ========================================================
// AUTHENTICATION (DIRECT PROFILES PROTOCOL)
// ========================================================
function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
    document.getElementById('signupForm').classList.toggle('hidden', isLogin);
    const btnL = document.getElementById('tab-login');
    const btnS = document.getElementById('tab-signup');
    if (isLogin) {
        btnL.className = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 text-white shadow-lg transition-all';
        btnS.className = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-slate-400 hover:text-white transition-all';
    } else {
        btnS.className = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 text-white shadow-lg transition-all';
        btnL.className = 'flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-slate-400 hover:text-white transition-all';
    }
}

async function handleLogin() {
    if (!supabase) return showToast('Initializing connection...');

    const identifier = document.getElementById('loginUsername').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    if (!identifier || !pass) return showToast('Please enter your username or phone number and password');

    toggleLoader(true, 'Authenticating credentials...');

    try {
        let userData = null;

        const { data: byUsername, error: usernameError } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', identifier)
            .eq('password', pass)
            .maybeSingle();

        if (!usernameError && byUsername) {
            userData = byUsername;
        } else {
            const { data: byPhone, error: phoneError } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone', identifier)
                .eq('password', pass)
                .maybeSingle();

            if (!phoneError && byPhone) userData = byPhone;
        }

        if (!userData) throw new Error('Invalid username/phone or password');
        if (userData.status === 'banned') throw new Error('Account suspended. Contact administration.');
        if (userData.status && userData.status !== 'active') throw new Error('Account is not active. Contact administration.');

        currentUser = userData;
        localStorage.setItem('currentUser', JSON.stringify(userData));
        localStorage.setItem('emx_remember', '1');
        localStorage.setItem('emx_username', identifier);
        localStorage.setItem('emx_password', pass);

        const banner = document.getElementById('signupSuccessBanner');
        if (banner) banner.classList.add('hidden');

        await loadVipTiers();
        initRealtime();
        await loadAppSettings();

        toggleLoader(false);
        showToast('✅ Welcome to Flux Haven');
        showHome();
    } catch (err) {
        toggleLoader(false);
        showToast('❌ ' + (err.message || 'Login failed'));
    }
}

async function processSignup() {
    if (!supabase) return showToast('Initializing connection...');

    const username = document.getElementById('signupUsername').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const pass = document.getElementById('signupPassword').value.trim();
    const ref = document.getElementById('signupReferral').value.trim();

    if (!username || !phone || !pass) return showToast('Please complete all registration fields');
    if (username.length < 3) return showToast('Username must be at least 3 characters');
    if (pass.length < 4) return showToast('Password must be at least 4 characters');
    if (username.toLowerCase() === 'admin') return showToast('The username admin is strictly reserved.');

    toggleLoader(true, 'Creating account...');

    try {
        const { data: existingUser, error: existingUserError } = await supabase
            .from('profiles').select('id').eq('username', username).maybeSingle();
        if (existingUserError) throw existingUserError;
        if (existingUser) { toggleLoader(false); return showToast('That username is already taken.'); }

        const { data: existingPhone, error: existingPhoneError } = await supabase
            .from('profiles').select('id').eq('phone', phone).maybeSingle();
        if (existingPhoneError) throw existingPhoneError;
        if (existingPhone) { toggleLoader(false); return showToast('An account with this phone number already exists.'); }

        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const randomNum = Math.floor(100 + Math.random() * 900);
        const refCode = 'FLUX' + randomStr + randomNum;

        const newProfileData = {
            username, phone, password: pass, full_name: username,
            referral_code: refCode, referred_by: ref || null,
            balance: 0, bonus_balance: 0, total_income: 0, locked_capital: 0,
            total_deposits: 0, total_withdrawals: 0, total_referral_earnings: 0,
            total_checkin_earnings: 0, role: 'user', status: 'active',
            current_plan_id: null, referral_reward_paid: false
        };

        const { error: insertError } = await supabase.from('profiles').insert([newProfileData]);
        if (insertError) throw insertError;

        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = pass;
        switchAuthTab('login');

        const banner = document.getElementById('signupSuccessBanner');
        if (banner) banner.classList.remove('hidden');

        toggleLoader(false);
        showToast('✅ Account registered! Signing you in...');
        await handleLogin();
    } catch (err) {
        toggleLoader(false);
        let msg = err.message || 'Registration failed';
        if (msg.includes('duplicate key') && msg.includes('username')) msg = 'That username is already taken.';
        else if (msg.includes('duplicate key') && msg.includes('phone')) msg = 'An account with this phone number already exists.';
        showToast('❌ ' + msg);
    }
}

function handleLogout() {
    stopRealtime();
    stopPresenceHeartbeat();
    stopAdminLiveRefresh();
    currentUser = null;
    appSettings = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('emx_remember');
    sessionStorage.removeItem('fh_deposit_flow');
    document.getElementById('bottomNav').classList.add('hidden');
    switchView('authPage');
    showToast('Securely signed out');
}

// ========================================================
// REALTIME DATA PROTOCOL
// ========================================================
function initRealtime() {
    if (!supabase || !currentUser) return;
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase.channel(`user-sync-${currentUser.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${currentUser.id}` },
            async (payload) => {
                if (payload.new) {
                    currentUser = payload.new;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    await refreshUserData();
                }
            })
        .subscribe();
}

function stopRealtime() {
    if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
}

// ========================================================
// APP SETTINGS
// ========================================================
async function loadAppSettings() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('admin_settings').select('*').eq('id', 1).single();
        if (error) { appSettings = appSettings || {}; return; }
        appSettings = data;
        if (data.company_description) {
            const descEl = document.getElementById('companyDescription');
            if (descEl) descEl.textContent = data.company_description;
        }
        if (data.announcement) {
            document.getElementById('announcementBanner').classList.remove('hidden');
            document.getElementById('announcementText').textContent = data.announcement;
        } else {
            document.getElementById('announcementBanner').classList.add('hidden');
        }
        if (data.telegram_link) {
            document.getElementById('telegramLinkBtn').href = data.telegram_link;
        }
    } catch (e) {
        appSettings = appSettings || {};
    }
}

// ========================================================
// PROMOTIONAL SPONSOR BRIEFS (20 HIGH-VALUE SPONSORS)
// ========================================================
const TASK_TEMPLATES = [
    {
        category: "ARTIFICIAL INTELLIGENCE",
        icon: "ph-sparkle",
        sponsor: "ChatGPT by OpenAI",
        title: "Explore Conversational Omnimodal Models",
        metricLabel: "Architecture",
        metricValue: "GPT-4o Omnimodal",
        badge: "AI PLATFORM",
        description: "Review OpenAI's enterprise models enabling natural-language summarization, creative drafting, and advanced reasoning.",
        link: "https://www.chatgpt.com/",
        linkText: "Visit OpenAI"
    },
    {
        category: "WORK MANAGEMENT",
        icon: "ph-notebook",
        sponsor: "Notion Workspace",
        title: "Unified Docs, Relational Databases, and Wikis",
        metricLabel: "Productivity",
        metricValue: "Connected Relational Blocks",
        badge: "PRODUCTIVITY",
        description: "Examine Notion's modular architecture connecting team wikis, product roadmaps, and agile sprint tracking in one place.",
        link: "https://www.notion.com/",
        linkText: "Visit Notion"
    },
    {
        category: "MULTIMODAL AI",
        icon: "ph-brain",
        sponsor: "Google Gemini",
        title: "Cross-Modal Processing Across Live Documents",
        metricLabel: "Context Window",
        metricValue: "1 Million Tokens",
        badge: "AI RESEARCH",
        description: "Inspect Google's native multi-modal intelligence integrating document analysis, video understanding, and automated analytics.",
        link: "https://gemini.google.com/",
        linkText: "Visit Google Gemini"
    },
    {
        category: "SOFTWARE ENGINEERING",
        icon: "ph-code",
        sponsor: "GitHub Copilot",
        title: "AI Pair Programmer for Enterprise Systems",
        metricLabel: "Compatibility",
        metricValue: "VS Code, JetBrains, Visual Studio",
        badge: "DEV SUITE",
        description: "Analyze how Copilot accelerates engineering sprints with real-time context-aware code completions and vulnerability detection.",
        link: "https://github.com/features/copilot",
        linkText: "Visit GitHub"
    },
    {
        category: "VISUAL CREATIVE",
        icon: "ph-palette",
        sponsor: "Canva Studio",
        title: "Empowering Distributed Teams with Visual Communication",
        metricLabel: "Asset Cloud",
        metricValue: "100M+ Verified Creative Assets",
        badge: "DESIGN SUITE",
        description: "Review Canva's enterprise visual communication suite enabling marketing collateral creation, brand kits, and video editing.",
        link: "https://www.canva.com/",
        linkText: "Visit Canva"
    },
    {
        category: "ENTERPRISE CHAT",
        icon: "ph-chat-circle-dots",
        sponsor: "Slack by Salesforce",
        title: "Automated Workflows & Channel Orchestration",
        metricLabel: "Integrations",
        metricValue: "2,600+ Platform Connectors",
        badge: "COLLABORATION",
        description: "Study how Slack unifies global operations through asynchronous huddles, searchable messaging channels, and workflow bots.",
        link: "https://slack.com/",
        linkText: "Visit Slack"
    },
    {
        category: "HIGHER EDUCATION",
        icon: "ph-graduation-cap",
        sponsor: "Coursera Campus",
        title: "Accredited Programs from Global Top Institutions",
        metricLabel: "Partners",
        metricValue: "300+ Leading Universities",
        badge: "EDUCATION",
        description: "Explore accredited specializations in data science, quantitative finance, and software systems taught by leading faculty.",
        link: "https://www.coursera.org/",
        linkText: "Visit Coursera"
    },
    {
        category: "EDGE INFRASTRUCTURE",
        icon: "ph-cloud",
        sponsor: "Vercel Platform",
        title: "Global Frontend Delivery via High-Speed Edge",
        metricLabel: "Network",
        metricValue: "300+ Edge Nodes Worldwide",
        badge: "SERVERLESS",
        description: "Evaluate Vercel's global CDN and serverless architecture delivering sub-second page performance and dynamic rendering.",
        link: "https://vercel.com/",
        linkText: "Visit Vercel"
    },
    {
        category: "PROJECT KANBAN",
        icon: "ph-kanban",
        sponsor: "Trello Workflows",
        title: "Visual Agile Boards for Fast-Paced Teams",
        metricLabel: "Automation",
        metricValue: "Butler Rule Engine",
        badge: "MANAGEMENT",
        description: "Inspect Trello's intuitive board-card system facilitating team sprints, feature backlogs, and structured project delivery.",
        link: "https://trello.com/",
        linkText: "Visit Trello"
    },
    {
        category: "ENCRYPTED CLOUD",
        icon: "ph-folder-open",
        sponsor: "Google Drive Enterprise",
        title: "Zero-Knowledge Encryption & Real-Time Sync",
        metricLabel: "Security",
        metricValue: "Enterprise DLP & Zero Trust",
        badge: "CLOUD STORAGE",
        description: "Discover enterprise Google Drive capabilities supporting live document multi-authoring, audit trails, and DLP rules.",
        link: "https://drive.google.com/",
        linkText: "Visit Google Drive"
    },
    {
        category: "COMMUNICATIONS",
        icon: "ph-video-camera",
        sponsor: "Zoom Communications",
        title: "High-Fidelity Conferencing and AI Meeting Notes",
        metricLabel: "Uptime",
        metricValue: "99.99% Enterprise Service",
        badge: "VIDEO SUITE",
        description: "Review Zoom's low-latency audio/video codecs, automated transcriptions, and interactive webinar hosting capabilities.",
        link: "https://www.zoom.com/",
        linkText: "Visit Zoom"
    },
    {
        category: "LINGUISTICS",
        icon: "ph-translate",
        sponsor: "Duolingo Platform",
        title: "Gamified Language Acquisition via Micro-Sessions",
        metricLabel: "Active Base",
        metricValue: "80M+ Monthly Learners",
        badge: "MICROLEARNING",
        description: "Examine Duolingo's spaced-repetition algorithms and gamified feedback loops that optimize daily language retention.",
        link: "https://www.duolingo.com/",
        linkText: "Visit Duolingo"
    },
    {
        category: "NO-CODE DATABASE",
        icon: "ph-spreadsheet",
        sponsor: "Airtable Data Cloud",
        title: "Custom Operational Applications on Relational Tables",
        metricLabel: "Data Models",
        metricValue: "Grid, Timeline, Gantt, Form",
        badge: "RELATIONAL",
        description: "Learn how Airtable blends familiar spreadsheet layouts with powerful relational database backends and automation.",
        link: "https://www.airtable.com/",
        linkText: "Visit Airtable"
    },
    {
        category: "WEB CREATIVE",
        icon: "ph-globe",
        sponsor: "Framer Studio",
        title: "Production-Grade Responsive Sites Without Code",
        metricLabel: "Performance",
        metricValue: "Lighthouse 100 Standards",
        badge: "WEB DESIGN",
        description: "Explore Framer's direct-to-canvas layout system generating optimized static websites with built-in localization and CMS.",
        link: "https://www.framer.com/",
        linkText: "Visit Framer"
    },
    {
        category: "AUTOMATION ENGINE",
        icon: "ph-lightning",
        sponsor: "Zapier Orchestration",
        title: "Inter-Application Orchestration & Cross-SaaS Sync",
        metricLabel: "Ecosystem",
        metricValue: "7,000+ Verified Cloud Connectors",
        badge: "INTEGRATION",
        description: "Inspect how Zapier chains disparate cloud services into unified data flows without maintaining dedicated API pipelines.",
        link: "https://zapier.com/",
        linkText: "Visit Zapier"
    },
    {
        category: "CONSTITUTIONAL AI",
        icon: "ph-shield-check",
        sponsor: "Claude by Anthropic",
        title: "Deep Analysis with Constitutional Safety Safeguards",
        metricLabel: "Context Window",
        metricValue: "200,000 Tokens",
        badge: "SAFETY AI",
        description: "Review Claude's extensive context window suited for extensive financial modeling, legal scrutiny, and technical research.",
        link: "https://claude.ai/",
        linkText: "Visit Anthropic"
    },
    {
        category: "CREDENTIAL SECURITY",
        icon: "ph-lock",
        sponsor: "Bitwarden Security",
        title: "End-to-End Encrypted Vault for Enterprise Logins",
        metricLabel: "Cryptography",
        metricValue: "AES-CBC 256-bit + PBKDF2",
        badge: "CYBERSECURITY",
        description: "Analyze Bitwarden's zero-knowledge cryptography ensuring enterprise password storage, biometric access, and secure sharing.",
        link: "https://bitwarden.com/",
        linkText: "Visit Bitwarden"
    },
    {
        category: "SURVEY SYSTEMS",
        icon: "ph-form",
        sponsor: "Typeform Interactive",
        title: "Conversational Data Collection with High Retention",
        metricLabel: "Completion Rate",
        metricValue: "4x Standard Web Forms",
        badge: "USER RESEARCH",
        description: "Learn how one-question-at-a-time conversational dynamics maximize completion rates for customer feedback and onboarding.",
        link: "https://www.typeform.com/",
        linkText: "Visit Typeform"
    },
    {
        category: "ANALYTICS ENGINE",
        icon: "ph-chart-bar",
        sponsor: "Google Analytics 4",
        title: "Cross-Platform Event Tracking and Machine Learning",
        metricLabel: "Modeling",
        metricValue: "Predictive Churn Engine",
        badge: "DATA SCIENCE",
        description: "Review GA4's event-driven data model tracing end-to-end customer journeys across mobile applications and web storefronts.",
        link: "https://analytics.google.com/",
        linkText: "Visit Google Analytics"
    },
    {
        category: "EMAIL CRM",
        icon: "ph-envelope-open",
        sponsor: "Mailchimp Marketing",
        title: "Automated Lifecycle Triggers & Smart Delivery",
        metricLabel: "Placement Rate",
        metricValue: "99% Inbox Placement Standard",
        badge: "MARKETING",
        description: "Study how Mailchimp applies predictive demographics, send-time optimization, and automated customer journeys.",
        link: "https://mailchimp.com/",
        linkText: "Visit Mailchimp"
    }
];

// ========================================================
// ATOMIC TASK EARNINGS ENGINE (INDIVIDUAL TASKS IN ANY ORDER)
// ========================================================

// Fetch today's completed task indices directly from database
async function getTodayCompletedTasks() {
    if (!currentUser || !supabase) return [];
    if (isSunday()) return [];
    try {
        const todayStr = getTodayDateString();

        // 1. Query task_completions table if exists
        try {
            const { data: compData, error: compErr } = await supabase
                .from('task_completions')
                .select('task_index')
                .eq('user_id', currentUser.id)
                .eq('completion_date', todayStr);

            if (!compErr && compData && compData.length > 0) {
                return [...new Set(compData.map(c => parseInt(c.task_index)).filter(n => !isNaN(n)))].sort((a, b) => a - b);
            }
        } catch (_) {}

        // 2. Query history table for records created today as source of truth
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('history')
            .select('description, created_at')
            .eq('user_id', currentUser.id)
            .eq('type', 'task')
            .gte('created_at', todayStart.toISOString());

        if (error || !data) return [];
        const completedIndices = [];
        data.forEach(item => {
            const match = item.description ? item.description.match(/Task (\d+)/i) : null;
            if (match && match[1]) {
                completedIndices.push(parseInt(match[1]));
            }
        });
        return [...new Set(completedIndices)].sort((a, b) => a - b);
    } catch (e) {
        console.error('Error loading today completed tasks:', e);
        return [];
    }
}

// Render Daily Tasks View (Any Order Execution Supported)
async function prepareTasksView() {
    if (!currentUser) return;
    if (vipTiers.length === 0) await loadVipTiers();

    const sundayBox = document.getElementById('tasksSundayState');
    const noVipBox = document.getElementById('tasksNoVipState');
    const activeBox = document.getElementById('tasksActiveState');

    if (isSunday()) {
        if (sundayBox) sundayBox.classList.remove('hidden');
        if (noVipBox) noVipBox.classList.add('hidden');
        if (activeBox) activeBox.classList.add('hidden');
        return;
    } else {
        if (sundayBox) sundayBox.classList.add('hidden');
    }

    const plan = getActiveVipTier(currentUser);

    if (!plan) {
        noVipBox.classList.remove('hidden');
        activeBox.classList.add('hidden');
        return;
    }

    noVipBox.classList.add('hidden');
    activeBox.classList.remove('hidden');

    const totalTasks = plan.tasks_per_day || 4;
    const taskReward = parseFloat(plan.reward_per_task) || 0;
    const completedTasks = await getTodayCompletedTasks();
    const completedCount = Math.min(completedTasks.length, totalTasks);
    const remainingCount = Math.max(0, totalTasks - completedCount);
    const percent = Math.min(100, Math.round((completedCount / totalTasks) * 100));

    document.getElementById('taskVipName').textContent = plan.name;
    document.getElementById('taskDailyPotential').textContent = `₦${fmt(plan.daily_reward)}`;
    document.getElementById('taskCompletedCount').textContent = `${completedCount} / ${totalTasks}`;
    document.getElementById('taskRemainingCount').textContent = remainingCount;
    document.getElementById('taskRewardPerItem').textContent = `+₦${fmt(taskReward)}`;
    document.getElementById('taskProgressPercent').textContent = `${percent}%`;
    document.getElementById('taskProgressBar').style.width = `${percent}%`;

    const allDoneNotice = document.getElementById('taskAllCompletedNotice');
    if (allDoneNotice) {
        allDoneNotice.classList.toggle('hidden', completedCount < totalTasks);
    }

    const list = document.getElementById('tasksListContainer');
    list.innerHTML = '';

    for (let i = 1; i <= totalTasks; i++) {
        const isDone = completedTasks.includes(i);
        const template = TASK_TEMPLATES[(i - 1) % TASK_TEMPLATES.length];
        
        const card = document.createElement('div');
        let cardBgClass = 'glass-panel border-white/10 bg-navy-850/90';
        if (isDone) {
            cardBgClass = 'glass-panel border-emerald-500/20 bg-emerald-500/5';
        } else {
            cardBgClass = 'glass-panel border-blue-500/40 bg-blue-500/10 shadow-[0_0_25px_rgba(37,99,235,0.15)]';
        }

        card.className = `${cardBgClass} rounded-2xl p-4 flex items-center justify-between transition-all`;
        
        let buttonHTML = '';
        if (isDone) {
            buttonHTML = `<span class="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-bold border border-emerald-500/30 inline-flex items-center gap-1"><i class="ph-bold ph-check"></i> Completed</span>`;
        } else if (completedCount >= totalTasks) {
            buttonHTML = `<button type="button" disabled class="bg-navy-900/80 text-slate-500 font-semibold px-3.5 py-1.5 rounded-xl text-xs border border-white/5 flex items-center gap-1 cursor-not-allowed">Done</button>`;
        } else {
            buttonHTML = `<button type="button" onclick="startTaskModal(${i})" id="taskBtn-${i}" class="btn-primary-gradient text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(37,99,235,0.4)] active:scale-95 transition">Execute <i class="ph-bold ph-lightning"></i></button>`;
        }

        card.innerHTML = `
            <div class="flex items-center gap-3.5 pr-2">
                <div class="w-10 h-10 rounded-xl ${isDone ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-cyan-300 border border-blue-500/30'} flex items-center justify-center font-black text-sm flex-shrink-0">
                    ${isDone ? '<i class="ph-bold ph-check text-lg"></i>' : `<i class="ph-fill ${template.icon} text-lg"></i>`}
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-white font-display">Task ${i}/${totalTasks}</span>
                        <span class="text-[8px] font-extrabold text-blue-300 uppercase tracking-wide border border-blue-500/20 px-1.5 py-0.5 rounded bg-blue-500/10">${template.badge}</span>
                    </div>
                    <div class="text-[11px] font-bold text-cyan-400 mt-0.5">+₦${fmt(taskReward)} <span class="text-slate-400 font-normal">· ${template.sponsor}</span></div>
                </div>
            </div>
            <div class="flex-shrink-0">
                ${buttonHTML}
            </div>
        `;
        list.appendChild(card);
    }
}

// Start Task Modal with NO NUMERICAL COUNTDOWN (Allows any incomplete task)
async function startTaskModal(taskIndex) {
    if (isSunday()) {
        return showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
    }
    if (isTaskExecuting) return;
    if (!currentUser || !supabase) return;

    const plan = getActiveVipTier(currentUser);
    if (!plan) return showToast('Approved active VIP tier required.');

    // Protect against duplicate completion of this individual task
    const completedTasks = await getTodayCompletedTasks();
    if (completedTasks.includes(taskIndex)) {
        return showToast(`Task ${taskIndex} has already been completed today.`);
    }

    if (completedTasks.length >= (plan.tasks_per_day || 0)) {
        return showToast('You have finished your tasks for today. Wait until tomorrow.');
    }

    const templateIndex = (taskIndex - 1) % TASK_TEMPLATES.length;
    const template = TASK_TEMPLATES[templateIndex];
    const taskReward = parseFloat(plan.reward_per_task) || 0;

    activeTaskSession = {
        taskIndex: taskIndex,
        plan: plan,
        reward: taskReward,
        startTime: Date.now(),
        requiredDuration: 10000,
        completed: false
    };

    document.getElementById('taskModalCategory').textContent = template.category;
    document.getElementById('taskModalIndexBadge').textContent = `Task ${taskIndex} of ${plan.tasks_per_day}`;
    document.getElementById('taskProgressCaption').textContent = 'Synchronizing engagement verification...';

    const contentContainer = document.getElementById('taskModalContent');
    contentContainer.innerHTML = `
        <div class="glass-panel p-4 rounded-2xl border-white/10 bg-navy-900/60">
            <div class="flex items-center gap-3 mb-2.5">
                <div class="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                    <i class="ph-fill ${template.icon} text-xl"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] text-slate-400 uppercase font-bold tracking-wider">${template.sponsor}</span>
                        <span class="text-[8px] font-extrabold text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded uppercase tracking-wider">${template.badge}</span>
                    </div>
                    <h4 class="text-sm font-extrabold text-white leading-tight font-display mt-0.5">${template.title}</h4>
                </div>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">${template.description}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="bg-navy-950 border border-white/5 rounded-xl p-3">
                <div class="text-[9px] text-slate-400 uppercase font-bold">${template.metricLabel}</div>
                <div class="text-xs font-bold text-white mt-0.5">${template.metricValue}</div>
            </div>
            <div class="bg-navy-950 border border-white/5 rounded-xl p-3">
                <div class="text-[9px] text-slate-400 uppercase font-bold">Reward Credit</div>
                <div class="text-xs font-black text-emerald-400 mt-0.5">+₦${fmt(taskReward)}</div>
            </div>
        </div>

        ${template.link ? `<a href="${template.link}" target="_blank" rel="noopener noreferrer" class="block w-full bg-blue-500/10 border border-blue-500/20 rounded-xl py-2.5 text-center text-xs font-bold text-cyan-300 hover:bg-blue-500/20 transition"><i class="ph-bold ph-arrow-square-out"></i> ${template.linkText}</a>` : ''}

        <div class="flex items-center justify-between px-2 pt-1 text-[10px] text-slate-500 font-mono">
            <span>Client Authentication Ledger</span>
            <span>FH-TASK-${taskIndex}98</span>
        </div>
    `;

    const modal = document.getElementById('taskExecutionModal');
    modal.classList.remove('hidden');

    // Run Smooth 10-Second Visual Progress Line (Strictly NO numbers)
    startSmoothProgressLine(10000);
}

function startSmoothProgressLine(durationMs) {
    const line = document.getElementById('taskProgressVisualLine');
    if (!line) return;

    if (taskAnimFrameId) {
        cancelAnimationFrame(taskAnimFrameId);
        taskAnimFrameId = null;
    }

    line.style.width = '0%';
    const startTime = performance.now();

    function step(now) {
        if (!activeTaskSession || activeTaskSession.completed) return;
        const elapsed = now - startTime;
        const progressRatio = Math.min(1, elapsed / durationMs);
        line.style.width = `${(progressRatio * 100).toFixed(2)}%`;

        if (progressRatio < 1) {
            taskAnimFrameId = requestAnimationFrame(step);
        } else {
            taskAnimFrameId = null;
            completeActiveTask();
        }
    }

    taskAnimFrameId = requestAnimationFrame(step);
}

// User explicitly cancels modal or clicks outside
function cancelTaskModal() {
    if (taskAnimFrameId) {
        cancelAnimationFrame(taskAnimFrameId);
        taskAnimFrameId = null;
    }

    if (activeTaskSession && !activeTaskSession.completed) {
        showToast('Task cancelled. No reward issued.');
    }

    activeTaskSession = null;
    const modal = document.getElementById('taskExecutionModal');
    if (modal) modal.classList.add('hidden');
}

function closeTaskModalDirectly() {
    if (taskAnimFrameId) {
        cancelAnimationFrame(taskAnimFrameId);
        taskAnimFrameId = null;
    }
    activeTaskSession = null;
    const modal = document.getElementById('taskExecutionModal');
    if (modal) modal.classList.add('hidden');
}

// Full 10-Second Server-Synchronized Task Completion (Credits single task reward & writes history)
async function completeActiveTask() {
    if (isSunday()) {
        cancelTaskModal();
        showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
        return;
    }
    if (!activeTaskSession || activeTaskSession.completed) return;

    const elapsed = Date.now() - (activeTaskSession.startTime || 0);
    if (elapsed < 9800) {
        cancelTaskModal();
        return;
    }

    activeTaskSession.completed = true;
    const { taskIndex, plan, reward } = activeTaskSession;

    const caption = document.getElementById('taskProgressCaption');
    if (caption) caption.textContent = 'Engagement verified! Crediting ledger...';

    isTaskExecuting = true;

    try {
        const todayStr = getTodayDateString();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Authoritative Duplicate Check (Check history and completions)
        const { data: existingCheck } = await supabase
            .from('history')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('type', 'task')
            .gte('created_at', todayStart.toISOString())
            .like('description', `Task ${taskIndex} Completed%`)
            .maybeSingle();

        if (existingCheck) {
            closeTaskModalDirectly();
            isTaskExecuting = false;
            showToast(`Task ${taskIndex} has already been credited today.`);
            await prepareTasksView();
            return;
        }

        try {
            const { data: compCheck } = await supabase
                .from('task_completions')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('task_index', taskIndex)
                .eq('completion_date', todayStr)
                .maybeSingle();

            if (compCheck) {
                closeTaskModalDirectly();
                isTaskExecuting = false;
                showToast(`Task ${taskIndex} has already been credited today.`);
                await prepareTasksView();
                return;
            }
        } catch (_) {}

        // 2. Fetch fresh profile from database
        const { data: freshUser, error: fetchErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (fetchErr || !freshUser) throw new Error('Account sync failed. Please try again.');

        const newBal = parseFloat(freshUser.balance || 0) + reward;
        const newIncome = parseFloat(freshUser.total_income || 0) + reward;
        const newTaskEarnings = parseFloat(freshUser.total_checkin_earnings || 0) + reward;

        // 3. Atomically update Profile balance and earnings
        const { error: updErr } = await supabase
            .from('profiles')
            .update({
                balance: newBal,
                total_income: newIncome,
                total_checkin_earnings: newTaskEarnings
            })
            .eq('id', currentUser.id);

        if (updErr) throw new Error('Balance update failed: ' + updErr.message);

        // 4. Save to task_completions table if table is present
        try {
            await supabase.from('task_completions').insert([{
                user_id: currentUser.id,
                task_index: taskIndex,
                completion_date: todayStr,
                reward_amount: reward
            }]);
        } catch (tcErr) {
            console.warn('task_completions table optional note:', tcErr);
        }

        // 5. Authoritative History record creation (Rigorous multi-path persistence)
        const histDesc = `Task ${taskIndex} Completed (${plan.name}) — +₦${fmt(reward)}`;
        let historySaved = false;

        // Strategy A: Direct insert into public.history
        try {
            const { error: dirHistErr } = await supabase
                .from('history')
                .insert([{
                    user_id: currentUser.id,
                    type: 'task',
                    amount: reward,
                    description: histDesc,
                    status: 'confirmed'
                }]);
            if (!dirHistErr) {
                historySaved = true;
            } else {
                console.warn('Direct history insert error, falling back:', dirHistErr);
            }
        } catch (e1) {
            console.warn('Direct history insert exception:', e1);
        }

        // Strategy B: RPC insert_history (5-param version)
        if (!historySaved) {
            try {
                const { error: rpc5Err } = await supabase.rpc('insert_history', {
                    p_user_id: currentUser.id,
                    p_type: 'task',
                    p_amount: reward,
                    p_description: histDesc,
                    p_status: 'confirmed'
                });
                if (!rpc5Err) {
                    historySaved = true;
                } else {
                    console.warn('RPC 5-param insert_history error:', rpc5Err);
                }
            } catch (e2) {
                console.warn('RPC 5-param exception:', e2);
            }
        }

        // Strategy C: RPC insert_history (4-param version)
        if (!historySaved) {
            try {
                const { error: rpc4Err } = await supabase.rpc('insert_history', {
                    p_user_id: currentUser.id,
                    p_type: 'task',
                    p_amount: reward,
                    p_description: histDesc
                });
                if (!rpc4Err) {
                    historySaved = true;
                } else {
                    console.warn('RPC 4-param insert_history error:', rpc4Err);
                }
            } catch (e3) {
                console.warn('RPC 4-param exception:', e3);
            }
        }

        // Strategy D: Direct insert without status column
        if (!historySaved) {
            try {
                const { error: noStatusErr } = await supabase
                    .from('history')
                    .insert([{
                        user_id: currentUser.id,
                        type: 'task',
                        amount: reward,
                        description: histDesc
                    }]);
                if (!noStatusErr) {
                    historySaved = true;
                } else {
                    console.error('Final fallback history insert failed:', noStatusErr);
                    throw new Error('Failed to record task in transaction history: ' + noStatusErr.message);
                }
            } catch (e4) {
                throw new Error('Failed to record task in transaction history: ' + e4.message);
            }
        }

        // 6. Update local user state & refresh views
        currentUser.balance = newBal;
        currentUser.total_income = newIncome;
        currentUser.total_checkin_earnings = newTaskEarnings;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        await refreshUserData();
        await prepareTasksView();

        closeTaskModalDirectly();
        isTaskExecuting = false;
        showToast(`✅ Task ${taskIndex} Completed! +₦${fmt(reward)}`);
    } catch (e) {
        console.error('Task execution error:', e);
        closeTaskModalDirectly();
        isTaskExecuting = false;
        showToast('❌ ' + (e.message || 'Task reward failed'));
    }
}

// ========================================================
// DASHBOARD UI SYNCHRONIZATION
// ========================================================
async function updateDashboardUI() {
    if (!currentUser) return;
    if (vipTiers.length === 0) await loadVipTiers();

    // Sunday Notice
    const homeSunBanner = document.getElementById('homeSundayBanner');
    if (homeSunBanner) {
        homeSunBanner.classList.toggle('hidden', !isSunday());
    }

    // Available Balance
    const dashBal = document.getElementById('dashBalance');
    if (dashBal) dashBal.textContent = `₦${fmt(currentUser.balance || 0)}`;

    // Active VIP Badge
    const plan = getActiveVipTier(currentUser);
    const vipText = document.getElementById('dashActiveVip');
    const vipBadge = document.getElementById('dashVipBadge');

    if (vipText && vipBadge) {
        if (plan) {
            vipText.textContent = `${plan.name}`;
            vipBadge.className = 'inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black tracking-wide bg-blue-500/15 border border-blue-500/40 text-cyan-300 shadow-[0_0_15px_rgba(37,99,235,0.2)]';
            vipBadge.innerHTML = `<i class="ph-fill ph-crown text-accent-gold text-sm"></i> <span>${plan.name}</span>`;
        } else {
            vipText.textContent = 'No Active VIP';
            vipBadge.className = 'inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-navy-950 border border-white/10 text-slate-400';
            vipBadge.innerHTML = `<i class="ph ph-shield-slash text-xs"></i> <span>No Active VIP</span>`;
        }
    }

    // Capital Invested
    const dashCap = document.getElementById('dashLockedCapital');
    if (dashCap) {
        dashCap.textContent = plan ? `₦${fmt(plan.cost)}` : `₦${fmt(currentUser.locked_capital || 0)}`;
    }

    // Today's Task Status on Home
    const completedTasks = await getTodayCompletedTasks();
    const completedCount = completedTasks.length;
    const totalTasks = plan ? (plan.tasks_per_day || 0) : 0;
    const remainingCount = Math.max(0, totalTasks - completedCount);
    const taskReward = plan ? (parseFloat(plan.reward_per_task) || 0) : 0;
    const todayEarned = completedCount * taskReward;

    const todayEarn = document.getElementById('dashTodayEarnings');
    if (todayEarn) {
        if (todayEarned > 0) {
            todayEarn.textContent = `+₦${fmt(todayEarned)}`;
            todayEarn.className = 'text-base sm:text-2xl font-black text-emerald-400 tracking-tight';
        } else {
            todayEarn.textContent = '₦0.00';
            todayEarn.className = 'text-base sm:text-2xl font-black text-slate-500 tracking-tight';
        }
    }

    const homeMsg = document.getElementById('dashTaskMessage');
    const homeProgress = document.getElementById('homeTaskProgress');
    const homeRemaining = document.getElementById('homeTaskRemaining');
    const homeBar = document.getElementById('homeTaskProgressBar');
    const homeStatusBadge = document.getElementById('homeTaskStatusBadge');
    const vipContent = document.getElementById('homeTaskVipContent');
    const noVipContent = document.getElementById('homeTaskNoVipContent');

    if (!plan) {
        if (vipContent) vipContent.classList.add('hidden');
        if (noVipContent) noVipContent.classList.remove('hidden');
        if (homeMsg) homeMsg.textContent = 'No active VIP plan yet.';
        if (homeStatusBadge) {
            homeStatusBadge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-navy-950 text-slate-400 border border-white/10';
            homeStatusBadge.textContent = 'No VIP';
        }
    } else {
        if (vipContent) vipContent.classList.remove('hidden');
        if (noVipContent) noVipContent.classList.add('hidden');

        if (isSunday()) {
            if (homeMsg) homeMsg.textContent = 'Sunday platform rest day — Quota unlocks Monday';
            if (homeStatusBadge) {
                homeStatusBadge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20';
                homeStatusBadge.textContent = 'Sunday Pause';
            }
        } else if (completedCount === 0) {
            if (homeMsg) homeMsg.textContent = 'You have not started your tasks today.';
        } else if (remainingCount === 0) {
            if (homeMsg) homeMsg.textContent = 'All tasks completed for today!';
        } else {
            if (homeMsg) homeMsg.textContent = `${remainingCount} task${remainingCount > 1 ? 's' : ''} available today`;
        }

        if (homeProgress) homeProgress.textContent = `Tasks completed: ${completedCount} / ${totalTasks}`;
        if (homeRemaining) homeRemaining.textContent = `Remaining today: ${remainingCount}`;
        if (homeBar) {
            const percent = totalTasks > 0 ? Math.min(100, Math.round((completedCount / totalTasks) * 100)) : 0;
            homeBar.style.width = `${percent}%`;
        }
        if (homeStatusBadge && !isSunday()) {
            if (remainingCount === 0) {
                homeStatusBadge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                homeStatusBadge.textContent = 'Completed';
            } else {
                homeStatusBadge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-cyan-300 border border-blue-500/30';
                homeStatusBadge.textContent = 'Active Plan';
            }
        }
    }
}

async function showHome() {
    switchView('homePage');
    if (currentUser && currentUser.role === 'admin') {
        document.getElementById('adminLaunchBtn').classList.remove('hidden');
        document.getElementById('adminLaunchBtn').classList.add('flex');
    } else {
        document.getElementById('adminLaunchBtn').classList.add('hidden');
        document.getElementById('adminLaunchBtn').classList.remove('flex');
    }
    await refreshUserData();
    updateVipFeatureVisibility();
    updatePwaInstallVisibility();
    startPresenceHeartbeat();
    if (!telegramPopupShown) { 
        telegramPopupShown = true; 
        setTimeout(() => { document.getElementById('telegramPopup').classList.remove('hidden'); }, 1500); 
    }
}

// ========================================================
// REFERRAL COMMISSIONS ON APPROVED DEPOSITS
// Level 1 = 10%, Level 2 = 3%, Level 3 = 1%
// Depositor receives strictly ₦0 from their own deposit.
// ========================================================
async function distributeDepositReferralCommissions(depositorId, depositAmount, depositorUsername) {
    if (!supabase || isSunday()) return;
    try {
        const { data: depositor } = await supabase.from('profiles').select('referred_by, username').eq('id', depositorId).single();
        if (!depositor || !depositor.referred_by) return;

        let currentRefCode = depositor.referred_by;
        let level = 1;
        const percents = [
            parseFloat((appSettings && appSettings.referral_level_a_percent) || 10),
            parseFloat((appSettings && appSettings.referral_level_b_percent) || 3),
            parseFloat((appSettings && appSettings.referral_level_c_percent) || 1)
        ];

        while (currentRefCode && level <= 3) {
            const { data: referrer } = await supabase.from('profiles').select('*').eq('referral_code', currentRefCode).maybeSingle();
            if (!referrer) break;

            const percent = percents[level - 1] || 0;
            const commission = depositAmount * (percent / 100);

            if (commission > 0) {
                const newBal = parseFloat(referrer.balance || 0) + commission;
                const newRefEarnings = parseFloat(referrer.total_referral_earnings || 0) + commission;
                const newTotalIncome = parseFloat(referrer.total_income || 0) + commission;

                await supabase.from('profiles').update({
                    balance: newBal,
                    total_referral_earnings: newRefEarnings,
                    total_income: newTotalIncome
                }).eq('id', referrer.id);

                try {
                    const rDesc = `Referral Commission (Level ${level}, ${percent}%) — ₦${fmt(commission)} from ${depositorUsername || 'referral'} deposit`;
                    const { error: rpcErr } = await supabase.rpc('insert_history', {
                        p_user_id: referrer.id,
                        p_type: 'referral',
                        p_amount: commission,
                        p_description: rDesc,
                        p_status: 'confirmed'
                    });
                    if (rpcErr) {
                        await supabase.from('history').insert([{
                            user_id: referrer.id,
                            type: 'referral',
                            amount: commission,
                            description: rDesc,
                            status: 'confirmed'
                        }]);
                    }
                } catch (histErr) {
                    console.error('Referral history error:', histErr);
                }

                try {
                    await supabase.from('referrals').upsert({
                        referrer_id: referrer.id,
                        referred_id: depositorId,
                        level: level,
                        commission_amount: commission
                    }, { onConflict: 'referrer_id,referred_id' });
                } catch (_) {}
            }

            const { data: nextUser } = await supabase.from('profiles').select('referred_by').eq('id', referrer.id).maybeSingle();
            currentRefCode = nextUser ? nextUser.referred_by : null;
            level++;
        }
    } catch (e) {
        console.error('Deposit referral distribution error:', e);
    }
}

// ========================================================
// DEPOSIT HUB & 6-SECOND PAYMENT TRANSITION
// ========================================================
async function checkPendingDepositStatus() {
    if (!currentUser || !supabase) return null;
    try {
        const { data, error } = await supabase
            .from('deposits')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0) return data[0];
    } catch (e) {
        console.error('Error checking pending deposit:', e);
    }
    return null;
}

async function prepareDepositView() {
    if (vipTiers.length === 0) await loadVipTiers();
    const activeTier = getActiveVipTier(currentUser);
    const activeLevel = activeTier ? activeTier.level : 0;

    const badgeEl = document.getElementById('depositCurrentVipBadge');
    if (badgeEl) {
        badgeEl.textContent = activeTier ? `Current: ${activeTier.name}` : 'Current: None';
    }

    const sunBanner = document.getElementById('depositSundayBanner');
    const selectionArea = document.getElementById('depositSelectionArea');

    if (isSunday()) {
        if (sunBanner) sunBanner.classList.remove('hidden');
        if (selectionArea) selectionArea.classList.add('opacity-50', 'pointer-events-none');
    } else {
        if (sunBanner) sunBanner.classList.add('hidden');
        if (selectionArea) selectionArea.classList.remove('opacity-50', 'pointer-events-none');
    }

    // CHECK FOR PENDING DEPOSIT LOCK
    const pendingDeposit = await checkPendingDepositStatus();
    const pendingLockBanner = document.getElementById('depositPendingLockBanner');
    const pendingLockText = document.getElementById('depositPendingLockText');

    if (pendingDeposit) {
        sessionStorage.removeItem('fh_deposit_flow');
        if (pendingLockBanner) pendingLockBanner.classList.remove('hidden');
        if (pendingLockText) {
            pendingLockText.textContent = `You have an existing pending deposit request of ₦${fmt(pendingDeposit.amount)} for ${pendingDeposit.stage_name || 'VIP Tier'}. Please wait until administration confirms or declines your current transfer before submitting another.`;
        }
        if (selectionArea) selectionArea.classList.add('opacity-50', 'pointer-events-none');
        document.getElementById('depositPlanGrid').classList.remove('hidden');
        document.getElementById('depositDetails').classList.add('hidden');
        document.getElementById('proceedPaymentBtn').classList.add('hidden');
        document.getElementById('paymentInstructionsSection').classList.add('hidden');
        loadDepositHistory();
        return;
    } else {
        if (pendingLockBanner) pendingLockBanner.classList.add('hidden');
        if (!isSunday() && selectionArea) selectionArea.classList.remove('opacity-50', 'pointer-events-none');
    }

    const grid = document.getElementById('depositPlanGrid');
    grid.innerHTML = vipTiers.map(tier => {
        const isCurrent = activeTier && activeTier.level === tier.level;
        const isLower = activeTier && tier.level < activeLevel;
        const isHigher = activeTier && tier.level > activeLevel;
        const isTierLocked = tier.level >= 7 || tier.locked;

        let actionText = '';
        let cardClasses = 'plan-card glass-panel rounded-2xl p-5 text-center cursor-pointer transition hover:border-blue-500/50 hover:shadow-[0_0_25px_rgba(37,99,235,0.2)] active:scale-95 border-white/10';

        if (isTierLocked) {
            actionText = '<div class="text-[10px] text-amber-400/90 font-bold mt-2 tracking-wider flex items-center justify-center gap-1"><i class="ph-bold ph-lock-key text-xs"></i> LOCKED</div>';
            cardClasses = 'plan-card glass-panel rounded-2xl p-5 text-center relative opacity-50 border-white/5 cursor-not-allowed';
        } else if (isCurrent) {
            actionText = '<div class="text-[10px] text-emerald-400 font-bold mt-2">CURRENT ACTIVE PLAN</div>';
            cardClasses = 'plan-card glass-panel rounded-2xl p-5 text-center relative opacity-60 border-blue-500/30 cursor-not-allowed';
        } else if (isLower) {
            actionText = '<div class="text-[10px] text-slate-500 font-bold mt-2">LOWER TIER</div>';
            cardClasses = 'plan-card glass-panel rounded-2xl p-5 text-center relative opacity-40 border-white/5 cursor-not-allowed';
        } else if (isHigher) {
            actionText = `<div class="text-[10px] text-cyan-300 font-bold mt-2">UPGRADE: ₦${fmt(tier.cost)}</div>`;
        }

        return `
            <div onclick="selectVipPlan(${tier.level})" id="vipCard-${tier.level}" class="${cardClasses}">
                <div class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 font-display">${tier.name}</div>
                <div class="text-xl font-black text-white leading-tight font-display">₦${fmt(tier.cost)}</div>
                <div class="text-xs font-bold text-cyan-400 bg-blue-500/10 border border-blue-500/20 inline-block px-2.5 py-0.5 rounded-lg mt-2">+₦${fmt(tier.daily_reward)}/day</div>
                ${actionText}
            </div>
        `;
    }).join('');

    // RESTORE SAVED PAYMENT STAGE PERSISTENCE
    const savedFlowStr = sessionStorage.getItem('fh_deposit_flow');
    if (savedFlowStr) {
        try {
            const savedFlow = JSON.parse(savedFlowStr);
            if (savedFlow.tierLevel <= 6) {
                const foundTier = vipTiers.find(t => t.level === savedFlow.tierLevel);
                if (foundTier && !foundTier.locked) {
                    selectedVipTier = foundTier;
                    selectedPayableAmount = Number(foundTier.cost);
                    renderPaymentInstructionsView();
                    loadDepositHistory();
                    return;
                }
            }
        } catch (_) {
            sessionStorage.removeItem('fh_deposit_flow');
        }
    }

    selectedVipTier = null;
    selectedPayableAmount = 0;
    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-500/15'));
    const dd = document.getElementById('depositDetails');
    const pb = document.getElementById('proceedPaymentBtn');
    const pi = document.getElementById('paymentInstructionsSection');
    if (dd) dd.classList.add('hidden');
    if (pb) pb.classList.add('hidden');
    if (pi) pi.classList.add('hidden');
    loadDepositHistory();
}

async function selectVipPlan(tierLevel) {
    if (isSunday()) {
        return showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
    }

    if (tierLevel >= 7) {
        return showToast('🔒 VIP ' + tierLevel + ' is currently locked.');
    }

    const pending = await checkPendingDepositStatus();
    if (pending) {
        return showToast('You already have a deposit pending review.');
    }

    if (vipTiers.length === 0) await loadVipTiers();
    const tier = vipTiers.find(t => t.level === tierLevel);
    if (!tier || tier.locked || tier.level >= 7) {
        return showToast('🔒 VIP ' + tierLevel + ' is currently locked.');
    }

    const activeTier = getActiveVipTier(currentUser);
    const activeLevel = activeTier ? activeTier.level : 0;

    if (activeTier && tier.level <= activeLevel) {
        return showToast('You already own this or a higher VIP tier.');
    }

    selectedVipTier = tier;
    selectedPayableAmount = Number(tier.cost);
    
    if (activeTier && tier.level > activeLevel) {
        document.getElementById('selectedActionType').textContent = `Upgrade from ${activeTier.name}`;
    } else {
        document.getElementById('selectedActionType').textContent = 'Full Tier Activation';
    }

    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-500/15'));
    const cardEl = document.getElementById(`vipCard-${tier.level}`);
    if (cardEl) cardEl.classList.add('border-blue-500', 'bg-blue-500/15');

    document.getElementById('depositDetails').classList.remove('hidden');
    document.getElementById('selectedStage').textContent = tier.name;
    document.getElementById('selectedAmount').textContent = `₦${fmt(selectedPayableAmount)}`;
    document.getElementById('selectedDailyTasks').textContent = `${tier.tasks_per_day} tasks / day`;
    document.getElementById('selectedRewardPerTask').textContent = `+₦${fmt(tier.reward_per_task)} / task`;
    document.getElementById('selectedDailyReward').textContent = `+₦${fmt(tier.daily_reward)} / day`;
    document.getElementById('selectedFixedWd').textContent = `₦${fmt(tier.fixed_withdrawal)}`;

    document.getElementById('proceedPaymentBtn').classList.remove('hidden');

    document.getElementById('paymentInstructionsSection').classList.add('hidden');
}

// 6-SECOND DEDICATED PAYMENT PREPARATION TRANSITION
function triggerPaymentTransition() {
    if (!selectedVipTier) return showToast('Please select a VIP plan first');
    if (selectedVipTier.level >= 7 || selectedVipTier.locked) {
        return showToast('🔒 This VIP tier is currently locked.');
    }
    if (isSunday()) {
        return showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
    }

    const overlay = document.getElementById('depositTransitionOverlay');
    const bar = document.getElementById('depPrepProgressBar');
    const titleEl = document.getElementById('depPrepTitle');
    const subEl = document.getElementById('depPrepSubtitle');
    const stageEl = document.getElementById('depPrepStageText');
    const secEl = document.getElementById('depPrepSecText');

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = 'width 6000ms cubic-bezier(0.1, 0.7, 0.1, 1)';
    bar.style.width = '100%';

    const stages = [
        { pct: 0, title: "Connecting to Settlement Network", sub: "Establishing secure financial channel...", stage: "Handshake", sec: "Step 1 of 3" },
        { pct: 2500, title: "Preparing Payment Instructions", sub: "Retrieving official verified beneficiary credentials...", stage: "Ledger Allocation", sec: "Step 2 of 3" },
        { pct: 4500, title: "Finalizing Transfer Order", sub: "Locking settlement order for authorization...", stage: "Order Ready", sec: "Step 3 of 3" }
    ];

    stages.forEach(s => {
        setTimeout(() => {
            if (titleEl) titleEl.textContent = s.title;
            if (subEl) subEl.textContent = s.sub;
            if (stageEl) stageEl.textContent = s.stage;
            if (secEl) secEl.textContent = s.sec;
        }, s.pct);
    });

    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');

        sessionStorage.setItem('fh_deposit_flow', JSON.stringify({
            tierLevel: selectedVipTier.level,
            payableAmount: selectedPayableAmount
        }));

        renderPaymentInstructionsView();

        const target = document.getElementById('paymentInstructionsSection');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 6000);
}

function renderPaymentInstructionsView() {
    document.getElementById('paymentPlanName').textContent = `${selectedVipTier.name} Transfer Order`;
    document.getElementById('paymentPlanAmount').textContent = `₦${fmt(selectedPayableAmount)}`;
    document.getElementById('payBankName').textContent = appSettings ? (appSettings.deposit_bank_name || 'Designated Bank') : 'Designated Bank';
    document.getElementById('payAccNum').textContent = appSettings ? (appSettings.deposit_account_number || '—') : '—';
    document.getElementById('payAccName').textContent = appSettings ? (appSettings.deposit_account_name || 'Flux Haven Settlement') : 'Flux Haven Settlement';
    document.getElementById('paymentReminderText').innerHTML = `Send exactly <strong>₦${fmt(selectedPayableAmount)}</strong> to the account above. Tap <strong>Confirm Payment</strong> below to send for review.`;

    document.getElementById('depositPlanGrid').classList.add('hidden');
    document.getElementById('depositDetails').classList.add('hidden');
    document.getElementById('proceedPaymentBtn').classList.add('hidden');
    document.getElementById('paymentInstructionsSection').classList.remove('hidden');
}

function backToPlanSelection() {
    sessionStorage.removeItem('fh_deposit_flow');
    document.getElementById('paymentInstructionsSection').classList.add('hidden');
    document.getElementById('depositPlanGrid').classList.remove('hidden');
    document.getElementById('depositDetails').classList.remove('hidden');
    document.getElementById('proceedPaymentBtn').classList.remove('hidden');
}

function copyAccountNumber() {
    const acc = document.getElementById('payAccNum').textContent.trim();
    if (!acc || acc === '—') return;
    navigator.clipboard.writeText(acc);
    showToast('📋 Account Number Copied');
}

function copyAmount() {
    if (!selectedPayableAmount) return;
    navigator.clipboard.writeText(selectedPayableAmount.toString());
    showToast('📋 Exact Amount Copied');
}

async function confirmPayment() {
    if (!selectedVipTier || selectedPayableAmount <= 0) return showToast('Please select a valid VIP plan');
    if (selectedVipTier.level >= 7 || selectedVipTier.locked) {
        return showToast('🔒 VIP ' + selectedVipTier.level + ' is currently locked.');
    }
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    if (!currentUser.bank_name || !currentUser.account_number) {
        return showToast('⚠️ Link settlement bank details in Profile first');
    }
    if (isSunday()) {
        return showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
    }

    toggleLoader(true, 'Registering transfer order...');
    try {
        const pending = await checkPendingDepositStatus();
        if (pending) {
            toggleLoader(false);
            sessionStorage.removeItem('fh_deposit_flow');
            await prepareDepositView();
            return showToast('🚫 You already have a pending deposit awaiting admin review.');
        }

        const { error } = await supabase.rpc('insert_deposit', {
            p_user_id: currentUser.id,
            p_amount: selectedPayableAmount,
            p_stage_name: selectedVipTier.name,
            p_receipt_data: null
        });
        if (error) {
            const { error: directErr } = await supabase.from('deposits').insert([{
                user_id: currentUser.id,
                amount: selectedPayableAmount,
                stage_name: selectedVipTier.name,
                status: 'pending'
            }]);
            if (directErr) throw directErr;
        }

        try {
            const dDesc = `VIP Deposit Request — ₦${fmt(selectedPayableAmount)} (${selectedVipTier.name})`;
            const { error: rpcErr } = await supabase.rpc('insert_history', {
                p_user_id: currentUser.id,
                p_type: 'deposit',
                p_amount: selectedPayableAmount,
                p_description: dDesc,
                p_status: 'pending'
            });
            if (rpcErr) {
                await supabase.from('history').insert([{
                    user_id: currentUser.id,
                    type: 'deposit',
                    amount: selectedPayableAmount,
                    description: dDesc,
                    status: 'pending'
                }]);
            }
        } catch (histErr) {
            console.error('Deposit history error:', histErr);
        }

        sessionStorage.removeItem('fh_deposit_flow');
        selectedVipTier = null;
        selectedPayableAmount = 0;

        toggleLoader(false);
        showToast('✅ Deposit submitted! Awaiting administration confirmation.');
        await prepareDepositView();
    } catch (e) {
        toggleLoader(false);
        showToast('❌ ' + (e.message || 'Submission failed'));
    }
}

async function loadDepositHistory() {
    const list = document.getElementById('depositHistoryList');
    if (!currentUser) return;
    try {
        const { data, error } = await supabase.from('deposits').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No deposits yet</div>';
            return;
        }
        list.innerHTML = data.map(d => {
            const statusColor = d.status === 'confirmed' ? 'text-cyan-400' : d.status === 'declined' ? 'text-red-400' : 'text-amber-400';
            const statusIcon = d.status === 'confirmed' ? 'ph-check-circle' : d.status === 'declined' ? 'ph-x-circle' : 'ph-hourglass';
            return `
            <div class="glass-panel rounded-2xl p-4 flex items-center justify-between border-white/5">
                <div class="flex items-center gap-3">
                    <i class="ph-fill ${statusIcon} ${statusColor} text-xl"></i>
                    <div>
                        <div class="text-xs font-bold text-white font-display">₦${fmt(d.amount)}</div>
                        <div class="text-[10px] text-slate-400">${d.stage_name || 'VIP Transfer'}</div>
                    </div>
                </div>
                <div class="text-[10px] font-bold ${statusColor} uppercase tracking-wider">${d.status}</div>
            </div>`;
        }).join('');
    } catch (e) { list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Failed to load deposits</div>'; }
}

// ========================================================
// WITHDRAWAL SAFETY ENGINE (MONDAY — FRIDAY, FIXED AMOUNTS, FULL BALANCE RESERVATION)
// ========================================================
const ALLOWED_WITHDRAWAL_AMOUNTS = [2000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000, 3000000];

function getWithdrawalOptionsForBalance(balance) {
    const availableBalance = parseFloat(balance || 0);
    return ALLOWED_WITHDRAWAL_AMOUNTS.filter(amount => amount <= availableBalance);
}

function selectWithdrawalAmount(amount) {
    const hidden = document.getElementById('withdrawAmount');
    const balance = parseFloat((currentUser && currentUser.balance) || 0);
    if (!hidden) return;
    if (!ALLOWED_WITHDRAWAL_AMOUNTS.includes(Number(amount)) || Number(amount) > balance) {
        return showToast('This withdrawal amount is not available for your current balance.');
    }
    hidden.value = String(amount);
    renderWithdrawalAmountOptions(balance, Number(amount));
    updateWithdrawFee();
}

function renderWithdrawalAmountOptions(balance, selectedAmount) {
    const container = document.getElementById('withdrawAmountOptions');
    const hidden = document.getElementById('withdrawAmount');
    if (!container) return;

    const availableBalance = parseFloat(balance || 0);
    const currentSelected = Number(
        selectedAmount !== undefined
            ? selectedAmount
            : (hidden ? hidden.value : 0)
    );

    container.innerHTML = ALLOWED_WITHDRAWAL_AMOUNTS.map(amount => {
        const available = amount <= availableBalance;
        const selected = available && amount === currentSelected;

        const base = 'w-full h-12 rounded-xl border text-sm font-bold transition-all active:scale-[0.98]';
        const cls = !available
            ? `${base} bg-navy-950/40 border-white/5 text-slate-600 opacity-50 cursor-not-allowed`
            : selected
                ? `${base} bg-blue-600 border-blue-400 text-white shadow-[0_0_22px_rgba(37,99,235,0.35)]`
                : `${base} bg-navy-850 border-white/10 text-slate-200 hover:border-blue-500/50 hover:bg-blue-500/10 cursor-pointer`;

        return `<button type="button" ${available ? `onclick="selectWithdrawalAmount(${amount})"` : 'disabled'} class="${cls}">
            ₦${fmt(amount)}
        </button>`;
    }).join('');

    if (hidden && (!ALLOWED_WITHDRAWAL_AMOUNTS.includes(currentSelected) || currentSelected > availableBalance)) {
        hidden.value = '';
    }
}

async function prepareWithdrawalView() {
    const wPlan = getActiveVipTier(currentUser);
    const wBalance = parseFloat((currentUser && currentUser.balance) || 0);
    const planEl = document.getElementById('withdrawCurrentPlan');
    const balEl = document.getElementById('withdrawAvailBalance');
    const msgEl = document.getElementById('withdrawEligibilityMsg');
    const dailyNote = document.getElementById('withdrawDailyLimitNote');
    const submitBtn = document.getElementById('withdrawSubmitBtn');

    if (dailyNote) {
        dailyNote.classList.add('hidden');
        dailyNote.textContent = '';
    }

    let withdrawnToday = false;
    if (currentUser && supabase) {
        try {
            const today = getTodayDateString();
            const start = `${today}T00:00:00+01:00`;
            const end = `${today}T23:59:59.999+01:00`;
            const { data: todayRows, error: todayErr } = await supabase
                .from('withdrawals')
                .select('id,status,amount,created_at')
                .eq('user_id', currentUser.id)
                .gte('created_at', start)
                .lte('created_at', end)
                .limit(1);
            if (!todayErr && todayRows && todayRows.length > 0) withdrawnToday = true;
        } catch (e) {
            console.debug('Daily withdrawal check unavailable:', e?.message || e);
        }
    }

    if (planEl && balEl && msgEl) {
        planEl.textContent = wPlan ? wPlan.name : 'Standard';
        balEl.textContent = `₦${fmt(wBalance)}`;

        if (!wPlan) {
            msgEl.textContent = 'An active VIP tier is required before any referral bonus or balance can be withdrawn.';
            msgEl.className = 'text-xs sm:text-sm font-semibold text-red-400';
        } else if (withdrawnToday) {
            msgEl.textContent = 'You have already submitted a withdrawal today. Your next withdrawal is available tomorrow.';
            msgEl.className = 'text-xs sm:text-sm font-semibold text-amber-300';
        } else if (wBalance < 2000) {
            msgEl.textContent = 'No fixed withdrawal option is available with your current balance.';
            msgEl.className = 'text-xs sm:text-sm font-semibold text-red-400';
        } else {
            msgEl.textContent = 'Choose any available fixed withdrawal amount below. Amounts above your balance are unavailable.';
            msgEl.className = 'text-xs sm:text-sm font-semibold text-cyan-400';
        }
    }

    if (withdrawnToday && dailyNote) {
        dailyNote.textContent = 'Daily limit reached — only one withdrawal request is allowed per day.';
        dailyNote.classList.remove('hidden');
    }

    renderWithdrawalAmountOptions(wBalance);

    const sunBanner = document.getElementById('withdrawSundayBanner');
    const banner = document.getElementById('withdrawTimeBanner');
    const title = document.getElementById('withdrawTimeTitle');
    const desc = document.getElementById('withdrawTimeDesc');
    const sH = appSettings ? parseInt(appSettings.withdrawal_start_hour || 9) : 9;
    const eH = appSettings ? parseInt(appSettings.withdrawal_end_hour || 17) : 17;
    const day = new Date().getDay();

    if (day === 0) {
        if (sunBanner) sunBanner.classList.remove('hidden');
        banner.classList.remove('border-white/10', 'border-amber-500/20');
        banner.classList.add('border-red-500/20');
        title.textContent = 'Sunday Closed';
        title.className = 'text-sm font-bold text-red-400';
        desc.textContent = 'Today is Sunday. All activities are unavailable today. Please come back on Monday.';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'pointer-events-none'); }
    } else if (day === 6) {
        if (sunBanner) sunBanner.classList.add('hidden');
        banner.classList.remove('border-white/10', 'border-red-500/20');
        banner.classList.add('border-amber-500/20');
        title.textContent = 'Withdrawals Closed on Saturdays';
        title.className = 'text-sm font-bold text-amber-400';
        desc.textContent = 'Withdrawals are available Monday — Friday only.';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'pointer-events-none'); }
    } else {
        if (sunBanner) sunBanner.classList.add('hidden');
        const status = getWithdrawalStatus();
        if (status.open) {
            banner.classList.remove('border-white/10', 'border-red-500/20', 'border-amber-500/20');
            banner.classList.add('border-emerald-500/20');
            title.textContent = 'Withdrawal Window Open';
            title.className = 'text-sm font-bold text-emerald-400';
            desc.textContent = `Requests accepted today between ${status.start}:00 and ${status.end}:00.`;
            if (submitBtn) {
                submitBtn.disabled = Boolean(withdrawnToday);
                submitBtn.classList.toggle('opacity-50', Boolean(withdrawnToday));
                submitBtn.classList.toggle('pointer-events-none', Boolean(withdrawnToday));
            }
        } else {
            banner.classList.remove('border-white/10', 'border-red-500/20', 'border-emerald-500/20');
            banner.classList.add('border-amber-500/20');
            title.textContent = 'Withdrawal Window Closed';
            title.className = 'text-sm font-bold text-amber-400';
            desc.textContent = `Requests accepted between ${status.start}:00 and ${status.end}:00, Monday — Friday.`;
            if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'pointer-events-none'); }
        }
    }
    const bankNameEl = document.getElementById('wBankName');
    const accNumberEl = document.getElementById('wAccNumber');
    const accNameEl = document.getElementById('wAccName');
    if (bankNameEl) bankNameEl.textContent = currentUser.bank_name || 'Not Linked';
    if (accNumberEl) accNumberEl.textContent = currentUser.account_number || '—';
    if (accNameEl) accNameEl.textContent = currentUser.account_name || '—';
    loadWithdrawHistory();

}
function getWithdrawalStatus() {
    const day = new Date().getDay();
    if (day === 0 || day === 6) return { open: false, start: 9, end: 17 };

    const sH = appSettings ? parseInt(appSettings.withdrawal_start_hour || 9) : 9;
    const eH = appSettings ? parseInt(appSettings.withdrawal_end_hour || 17) : 17;
    const hour = new Date().getHours();

    return { open: hour >= sH && hour < eH, start: sH, end: eH };
}

function updateWithdrawFee() {
    const select = document.getElementById('withdrawAmount');
    const val = parseFloat(select ? select.value : '');
    const feeBox = document.getElementById('withdrawFeeSummary');
    if (!feeBox) return;
    if (!val || !ALLOWED_WITHDRAWAL_AMOUNTS.includes(val)) {
        feeBox.classList.add('hidden');
        return;
    }
    const feePct = appSettings ? parseFloat(appSettings.withdrawal_fee_percent || 15) : 15;
    const fee = val * (feePct / 100);
    const net = val - fee;
    feeBox.classList.remove('hidden');
    feeBox.innerHTML = `<strong>Processing Fee (${feePct}%):</strong> ₦${fmt(fee)} | <strong>Disbursement:</strong> <span class="text-white font-bold">₦${fmt(net)}</span>`;

}

async function requestWithdrawal() {
    const day = new Date().getDay();

    if (day === 0) return showToast('Today is Sunday. All activities are unavailable today. Please come back on Monday.');
    if (day === 6) return showToast('Withdrawals are closed on Saturdays. Withdrawals are available Monday — Friday.');
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    if (!getActiveVipTier(currentUser)) return showToast('An active VIP tier is required before you can withdraw your referral bonus or balance.');

    const amount = parseFloat(document.getElementById('withdrawAmount').value);

    if (!ALLOWED_WITHDRAWAL_AMOUNTS.includes(amount)) return showToast('Select one of the fixed withdrawal amounts.');

    const status = getWithdrawalStatus();
    if (!status.open) return showToast(`🚫 Withdrawals are closed. Operating hours: ${status.start}:00 — ${status.end}:00, Monday — Friday`);

    if (!currentUser.bank_name || !currentUser.account_number) {
        return showToast('⚠️ Link settlement bank details in Profile first');
    }

    toggleLoader(true, 'Processing reservation...');

    try {
        const { data: pendingRows, error: pendingErr } = await supabase
            .from('withdrawals')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'pending')
            .limit(1);

        if (pendingErr) throw pendingErr;
        if (pendingRows && pendingRows.length > 0) {
            toggleLoader(false);
            return showToast('🚫 You already have a pending withdrawal awaiting admin review.');
        }

        const feePct = appSettings ? parseFloat(appSettings.withdrawal_fee_percent || 15) : 15;
        const fee = amount * (feePct / 100);
        const net = amount - fee;

        const { data: result, error: atomicErr } = await supabase.rpc('request_withdrawal_atomic', {
            p_user_id: currentUser.id,
            p_amount: amount,
            p_fee_amount: fee,
            p_net_amount: net,
            p_bank_name: currentUser.bank_name,
            p_account_number: currentUser.account_number,
            p_account_name: currentUser.account_name
        });

        if (atomicErr) {
            const msg = (atomicErr.message || '').toLowerCase();
            if (msg.includes('pending withdrawal')) {
                throw new Error('You already have a pending withdrawal awaiting admin review.');
            }
            if (msg.includes('insufficient available balance')) {
                const { data: latestUser } = await supabase.from('profiles').select('balance').eq('id', currentUser.id).single();
                const latestBal = parseFloat((latestUser && latestUser.balance) || 0);
                renderWithdrawalAmountOptions(latestBal);
            }
            throw atomicErr;
        }

        const row = Array.isArray(result) ? result[0] : result;
        const newBal = parseFloat((row && row.new_balance) ?? ((currentUser && currentUser.balance) || 0) - amount);
        const newTotalWd = parseFloat((row && row.new_total_withdrawals) ?? ((currentUser && currentUser.total_withdrawals) || 0) + amount);

        try {
            const wDesc = `Withdrawal Request — ₦${fmt(amount)} (Fee: ₦${fmt(fee)}, Net: ₦${fmt(net)})`;
            const { error: rpcErr } = await supabase.rpc('insert_history', {
                p_user_id: currentUser.id, p_type: 'withdrawal', p_amount: amount,
                p_description: wDesc, p_status: 'pending'
            });
            if (rpcErr) {
                await supabase.from('history').insert([{
                    user_id: currentUser.id, type: 'withdrawal', amount: amount,
                    description: wDesc, status: 'pending'
                }]);
            }
        } catch (histErr) {
            console.error('Withdrawal history error:', histErr);
        }

        currentUser.balance = newBal;
        currentUser.total_withdrawals = newTotalWd;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await refreshUserData();

        toggleLoader(false);
        showToast('✅ Withdrawal submitted. Funds reserved.');

        const amountSelect = document.getElementById('withdrawAmount');
        if (amountSelect) amountSelect.value = '';
        document.getElementById('withdrawFeeSummary').classList.add('hidden');
        prepareWithdrawalView();
    } catch (e) {
        toggleLoader(false);
        showToast('❌ ' + (e.message || 'Request failed'));
    }
}

async function loadWithdrawHistory() {
    const list = document.getElementById('withdrawHistoryList');
    if (!currentUser) return;
    try {
        const { data, error } = await supabase.from('withdrawals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No withdrawals yet</div>';
            return;
        }
        list.innerHTML = data.map(w => {
            const statusColor = w.status === 'confirmed' ? 'text-cyan-400' : w.status === 'declined' ? 'text-red-400' : 'text-amber-400';
            const statusIcon = w.status === 'confirmed' ? 'ph-check-circle' : w.status === 'declined' ? 'ph-x-circle' : 'ph-hourglass';
            return `
            <div class="glass-panel rounded-2xl p-4 flex items-center justify-between border-white/5">
                <div class="flex items-center gap-3">
                    <i class="ph-fill ${statusIcon} ${statusColor} text-xl"></i>
                    <div>
                        <div class="text-xs font-bold text-white font-display">₦${fmt(w.amount)}</div>
                        <div class="text-[10px] text-slate-400">Net Disbursement: ₦${fmt(w.net_amount)}</div>
                    </div>
                </div>
                <div class="text-[10px] font-bold ${statusColor} uppercase tracking-wider">${w.status}</div>
            </div>`;
        }).join('');
    } catch (e) { list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Failed to load withdrawals</div>'; }
}

// ========================================================
// PROFILE & BANK SETTINGS
// ========================================================
async function prepareProfileView() {
    if (!currentUser) return;
    document.getElementById('profileUsername').textContent = currentUser.username || '—';
    document.getElementById('profilePhone').textContent = currentUser.phone || '—';
    document.getElementById('profileReferralCode').textContent = currentUser.referral_code || 'N/A';
    document.getElementById('profileBalance').textContent = `₦${fmt(currentUser.balance)}`;
    document.getElementById('profileTotalDeposits').textContent = `₦${fmt(currentUser.total_deposits)}`;
    document.getElementById('profileTotalWithdrawals').textContent = `₦${fmt(currentUser.total_withdrawals)}`;
    document.getElementById('profileTotalIncome').textContent = `₦${fmt(currentUser.total_income)}`;
    document.getElementById('profileCheckinEarnings').textContent = `₦${fmt(currentUser.total_checkin_earnings)}`;
    document.getElementById('profileReferralEarnings').textContent = `₦${fmt(currentUser.total_referral_earnings)}`;
    document.getElementById('profileLockedCapital').textContent = `₦${fmt(currentUser.locked_capital)}`;
    document.getElementById('profileRegDate').textContent = currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString() : '—';

    document.getElementById('profileFullName').value = currentUser.full_name || '';
}

async function loadReferralTracking() {
    if (!currentUser || !supabase) return;
    if (vipTiers.length === 0) await loadVipTiers();
    document.getElementById('trackReferralCode').textContent = currentUser.referral_code || 'N/A';

    const grid = document.getElementById('referralTrackingGrid');
    if (!grid) return;

    grid.innerHTML = vipTiers.map(tier => `
        <div class="glass-panel rounded-2xl p-4 border-white/5 text-center">
            <div class="text-[10px] text-slate-400 uppercase font-bold mb-0.5 font-display">${tier.name}</div>
            <div class="text-2xl font-black text-cyan-400" id="vipRefCount-${tier.level}">0</div>
            <div class="text-[9px] text-slate-500 mt-1">₦${fmt(tier.cost)}</div>
        </div>
    `).join('');

    try {
        const { data: referrals } = await supabase
            .from('referrals')
            .select('referred_id')
            .eq('referrer_id', currentUser.id)
            .eq('level', 1);

        if (!referrals || referrals.length === 0) return;
        const referredIds = referrals.map(r => r.referred_id);

        const { data: deposits } = await supabase
            .from('deposits')
            .select('user_id, amount, stage_name, status')
            .in('user_id', referredIds)
            .eq('status', 'confirmed');

        if (!deposits) return;

        vipTiers.forEach(tier => {
            const count = deposits.filter(d => 
                (d.stage_name && d.stage_name.toLowerCase() === tier.name.toLowerCase()) || 
                Number(d.amount) === Number(tier.cost)
            ).length;
            const el = document.getElementById(`vipRefCount-${tier.level}`);
            if (el) el.textContent = count;
        });
    } catch (e) { console.error('Referral tracking error:', e); }
}

async function saveBankDetails() {
    const b = document.getElementById('bankNameInput').value.trim();
    const a = document.getElementById('bankAccNumberInput').value.trim();
    const n = document.getElementById('bankAccNameInput').value.trim();
    if (!b || !a || !n) return showToast('Please complete all bank fields');
    if (a.length !== 10) return showToast('Account number must be exactly 10 digits');
    toggleLoader(true, 'Saving Settlement Account...');
    try {
        const { error } = await supabase.rpc('update_bank_details', {
            p_user_id: currentUser.id,
            p_bank_name: b,
            p_account_number: a,
            p_account_name: n
        });
        if (error) {
            await supabase.from('profiles').update({
                bank_name: b,
                account_number: a,
                account_name: n
            }).eq('id', currentUser.id);
        }

        currentUser.bank_name = b;
        currentUser.account_number = a;
        currentUser.account_name = n;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showToast('✅ Bank details saved successfully');
        closeBankModal();
    } catch (e) { 
        showToast('❌ Save failed: ' + (e.message || 'Unknown error')); 
    }
    toggleLoader(false);
}

function openBankModal() {
    if (!currentUser) return;
    document.getElementById('bankNameInput').value = currentUser.bank_name || '';
    document.getElementById('bankAccNumberInput').value = currentUser.account_number || '';
    document.getElementById('bankAccNameInput').value = currentUser.account_name || '';
    document.getElementById('bankDetailsModal').classList.remove('hidden');
}

function closeBankModal() {
    document.getElementById('bankDetailsModal').classList.add('hidden');
}

async function saveProfile() {
    const fullName = document.getElementById('profileFullName').value.trim();

    if (!fullName) return showToast('Legal name is required');

    toggleLoader(true, 'Updating Profile...');

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ full_name: fullName })
            .eq('id', currentUser.id);

        if (error) throw error;

        currentUser.full_name = fullName;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showToast('✅ Profile updated');
    } catch (e) {
        showToast('❌ Update failed');
    }

    toggleLoader(false);
}

function copyCode(isLink) {
    const code = currentUser ? currentUser.referral_code : '';
    const txt = isLink ? `${window.location.origin}${window.location.pathname}?ref=${code}` : code;
    navigator.clipboard.writeText(txt);
    showToast(isLink ? '🔗 Referral link copied' : '📋 Referral code copied');
}

// ========================================================
// HISTORY SYSTEM (AUDIT LOGS RECEIVES TASK EARNINGS)
// ========================================================
async function loadHistory() {
    const feed = document.getElementById('historyFeed');
    if (!supabase) { feed.innerHTML = '<div class="text-center text-red-400 py-10 text-sm">Connection error. Refresh and try again.</div>'; return; }
    feed.innerHTML = '<div class="text-center text-slate-500 py-10 text-sm">Loading ledger entries...</div>';
    try {
        let query = supabase.from('history').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if (currentHistoryFilter !== 'all') {
            query = query.eq('type', currentHistoryFilter);
        }
        const { data, error } = await query.limit(50);
        if (error) throw error;
        if (!data || data.length === 0) {
            feed.innerHTML = '<div class="text-center text-slate-500 py-10 text-sm">No transaction records found.</div>';
            return;
        }
        renderHistoryList(data, feed);
    } catch (e) {
        console.error('History load error:', e);
        feed.innerHTML = '<div class="text-center text-red-400 py-10 text-sm">Failed to load history.</div>';
    }
}

function renderHistoryList(data, container) {
    container.innerHTML = data.map(tx => {
        let icon = 'ph-clock'; let iconColor = 'text-slate-400'; let amountColor = 'text-slate-400'; let sign = '';
        if (tx.status === 'declined') { 
            icon = 'ph-x-circle'; 
            iconColor = 'text-red-400'; 
            amountColor = 'text-red-400 line-through opacity-70'; 
        } else if (tx.status === 'pending') { 
            icon = 'ph-hourglass'; 
            iconColor = 'text-amber-400'; 
            amountColor = 'text-amber-400'; 
            sign = '~'; 
        } else {
            if (tx.type === 'deposit') { icon = 'ph-arrow-circle-down'; iconColor = 'text-cyan-400'; amountColor = 'text-cyan-400'; sign = '+'; }
            else if (tx.type === 'withdrawal') { icon = 'ph-arrow-circle-up'; iconColor = 'text-red-400'; amountColor = 'text-red-400'; sign = '-'; }
            else if (tx.type === 'task') { icon = 'ph-check-circle'; iconColor = 'text-emerald-400'; amountColor = 'text-emerald-400'; sign = '+'; }
            else if (tx.type === 'referral') { icon = 'ph-users'; iconColor = 'text-cyan-400'; amountColor = 'text-cyan-400'; sign = '+'; }
            else if (tx.type === 'admin_credit') { icon = 'ph-plus-circle'; iconColor = 'text-emerald-400'; amountColor = 'text-emerald-400'; sign = '+'; }
            else if (tx.type === 'admin_deduction') { icon = 'ph-minus-circle'; iconColor = 'text-red-400'; amountColor = 'text-red-400'; sign = '-'; }
            else if (tx.type === 'refund') { icon = 'ph-arrow-u-up-left'; iconColor = 'text-emerald-400'; amountColor = 'text-emerald-400'; sign = '+'; }
            else if (tx.type === 'gift') { icon = 'ph-gift'; iconColor = 'text-amber-300'; amountColor = 'text-amber-300'; sign = '+'; }
            else if (tx.type === 'lucky_heart') { icon = 'ph-heart'; iconColor = 'text-pink-300'; amountColor = 'text-emerald-300'; sign = '+'; }
            else if (tx.type === 'wealth') {
                if (String(tx.description || '').toLowerCase().includes('started')) {
                    icon = 'ph-chart-line-up'; iconColor = 'text-cyan-300'; amountColor = 'text-red-300'; sign = '-';
                } else {
                    icon = 'ph-chart-line-up'; iconColor = 'text-cyan-300'; amountColor = 'text-emerald-300'; sign = '+';
                }
            }
        }
        const historyTypeLabel = tx.type === 'gift' ? 'Surprise Gift' : tx.type === 'lucky_heart' ? 'Lucky Heart' : tx.type === 'wealth' ? 'F/H Wealth Center' : tx.type;
        return `
        <div class="glass-panel rounded-2xl p-4 flex items-center justify-between border-white/5">
            <div class="flex items-start gap-3">
                <div class="mt-0.5"><i class="ph-fill ${icon} ${iconColor} text-2xl"></i></div>
                <div>
                    <div class="text-xs font-bold text-slate-300 uppercase tracking-widest font-display">${historyTypeLabel} ${tx.status === 'pending' ? '(Pending)' : ''}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">${new Date(tx.created_at).toLocaleString()}</div>
                    <div class="text-xs text-slate-300 mt-1 leading-relaxed pr-2">${tx.description}</div>
                </div>
            </div>
            <div class="text-base font-black ${amountColor} flex-shrink-0 ml-1 font-display">${sign}₦${fmt(tx.amount)}</div>
        </div>`;
    }).join('');
}

function filterHistory(type) {
    currentHistoryFilter = type;
    document.querySelectorAll('.history-filter').forEach(btn => {
        const isActive = btn.dataset.filter === type;
        btn.classList.toggle('bg-blue-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-navy-850', !isActive);
        btn.classList.toggle('text-slate-400', !isActive);
    });
    loadHistory();
}

// ========================================================
// ADMIN ROOT ACTIONS & WORKFLOW CONTROLS
// ========================================================
async function loadAdminData() {
    if (!currentUser || currentUser.role !== 'admin') return;
    await loadAdminStats();
    await loadAdminUsers();
    await loadAdminDeposits();
    await loadAdminWithdrawals();
    await loadAdminSettingsForm();
    await loadAdminGiftData();
    await loadAdminNewFeaturesData();
    await loadAdminLiveUsers();
    startAdminLiveRefresh();
}

async function adminRefreshData() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const btn = document.getElementById('adminRefreshBtn');
    const icon = document.getElementById('adminRefreshIcon');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    if (icon) { icon.style.transition = 'transform 0.5s'; icon.style.animation = 'spin-slow 0.8s linear infinite'; }
    try {
        await loadAdminStats();
        await loadAdminUsers();
        await loadAdminDeposits();
        await loadAdminWithdrawals();
        await loadAdminSettingsForm();
        await loadAdminGiftData();
        await loadAdminNewFeaturesData();
        await loadAdminLiveUsers();
        startAdminLiveRefresh();
        showToast('✅ Administration data refreshed');
    } catch (e) {
        showToast('❌ Refresh failed');
    }
    if (icon) { icon.style.animation = ''; }
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
}

async function loadAdminStats() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.rpc('get_admin_stats');
        if (error || !data || data.length === 0) return;
        const s = data[0];
        document.getElementById('adminTotalUsers').textContent = s.total_users || 0;
        document.getElementById('adminActiveUsers').textContent = s.active_users || 0;
        document.getElementById('adminTotalDeposits').textContent = `₦${fmt(s.total_deposits || 0)}`;
        document.getElementById('adminTotalWithdrawals').textContent = `₦${fmt(s.total_withdrawals || 0)}`;
        document.getElementById('adminTotalRewards').textContent = `₦${fmt(s.total_rewards || 0)}`;
        document.getElementById('adminPendingCount').textContent = (s.pending_deposits || 0) + (s.pending_withdrawals || 0);
    } catch (e) { console.error('Supabase admin stats error:', e); }
}

async function loadAdminUsers() {
    const list = document.getElementById('adminUsersList');
    const search = document.getElementById('adminUserSearch')?.value.trim() || '';
    try {
        let query = supabase.from('profiles').select('*').eq('role', 'user').order('created_at', { ascending: false });
        if (search) {
            query = query.or(`username.ilike.%${search}%,phone.ilike.%${search}%,referral_code.ilike.%${search}%`);
        }
        const { data, error } = await query.limit(50);
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No users found.</div>';
            return;
        }
        list.innerHTML = data.map(u => `
            <div class="glass-panel rounded-2xl p-4 border-white/5" id="userCard-${u.id}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="text-sm font-bold text-white font-display">${u.username || '—'}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${u.phone || '—'} · ${u.referral_code || '—'}</div>
                    </div>
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ${u.status === 'active' ? 'bg-blue-500/10 text-cyan-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">${u.status}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 mb-3 text-xs">
                    <div class="bg-navy-950 rounded-xl p-2.5 text-center">
                        <div class="text-slate-400 text-[10px]">Balance</div>
                        <div class="text-white font-bold font-display">₦${fmt(u.balance)}</div>
                    </div>
                    <div class="bg-navy-950 rounded-xl p-2.5 text-center">
                        <div class="text-slate-400 text-[10px]">Active VIP</div>
                        <div class="text-cyan-400 font-bold font-display">${u.current_plan_id ? 'VIP ' + u.current_plan_id : 'None'}</div>
                    </div>
                    <div class="bg-navy-950 rounded-xl p-2.5 text-center">
                        <div class="text-slate-400 text-[10px]">Total Income</div>
                        <div class="text-cyan-400 font-bold font-display">₦${fmt(u.total_income)}</div>
                    </div>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button type="button" onclick="adminAdjustBalance('${u.id}', 1000, 'credit')" class="px-3 py-1.5 rounded-lg bg-blue-500/10 text-cyan-300 text-[10px] font-bold border border-blue-500/20 hover:bg-blue-500/20 transition">+₦1K</button>
                    <button type="button" onclick="adminAdjustBalance('${u.id}', 5000, 'credit')" class="px-3 py-1.5 rounded-lg bg-blue-500/10 text-cyan-300 text-[10px] font-bold border border-blue-500/20 hover:bg-blue-500/20 transition">+₦5K</button>
                    <button type="button" onclick="adminAdjustBalance('${u.id}', 1000, 'deduct')" class="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20 hover:bg-red-500/20 transition">-₦1K</button>
                    <button type="button" onclick="adminToggleBan('${u.id}', '${u.status}')" class="px-3 py-1.5 rounded-lg bg-navy-850 text-slate-400 text-[10px] font-bold border border-white/5 hover:bg-navy-900 transition">${u.status === 'active' ? 'Ban' : 'Unban'}</button>
                    <button type="button" onclick="adminDeleteUser('${u.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20 hover:bg-red-500/20 transition">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Failed to load users</div>';
    }
}

function searchAdminUsers() {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(loadAdminUsers, 400);
}

async function loadAdminDeposits() {
    const list = document.getElementById('pendingDeposits');
    try {
        const { data, error } = await supabase.from('deposits').select('*, profiles(username, phone, full_name, bank_name, account_number, account_name)').eq('status', 'pending').order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No pending deposits.</div>';
            return;
        }
        list.innerHTML = data.map(d => `
            <div class="glass-panel rounded-2xl p-4 border-blue-500/30" id="depCard-${d.id}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="text-xs font-bold text-cyan-400 font-display">VIP Deposit Transfer</div>
                        <div class="text-[10px] text-slate-400">${d.profiles?.username || '—'} · ${d.profiles?.phone || '—'}</div>
                    </div>
                    <div class="text-lg font-black text-white font-display">₦${fmt(Number(d.amount))}</div>
                </div>
                <div class="bg-navy-950 rounded-xl p-3 mb-3 text-xs text-slate-400 space-y-1">
                    <div class="flex justify-between"><span>Tier Target:</span><span class="text-white font-bold font-display">${d.stage_name || '—'}</span></div>
                    <div class="flex justify-between"><span>Account Name:</span><span class="text-white">${d.profiles?.full_name || '—'}</span></div>
                    <div class="flex justify-between"><span>Sender Bank:</span><span>${d.profiles?.bank_name || '—'}</span></div>
                    <div class="flex justify-between"><span>Account No:</span><span class="font-mono text-white">${d.profiles?.account_number || '—'}</span></div>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="approveDeposit('${d.id}', '${d.user_id}', ${d.amount})" class="flex-1 btn-primary-gradient text-white font-bold py-2.5 rounded-xl text-xs hover:opacity-90 transition">Approve & Activate</button>
                    <button type="button" onclick="declineDeposit('${d.id}', '${d.user_id}', ${d.amount})" class="flex-1 bg-red-500/20 text-red-400 font-bold py-2.5 rounded-xl text-xs hover:bg-red-500/30 transition">Decline</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Failed to load deposits</div>';
    }
}

async function loadAdminWithdrawals() {
    const list = document.getElementById('pendingWithdrawals');
    try {
        const { data, error } = await supabase.from('withdrawals').select('*, profiles(username, phone, full_name)').eq('status', 'pending').order('created_at', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No pending withdrawals.</div>';
            return;
        }
        list.innerHTML = data.map(w => `
            <div class="glass-panel rounded-2xl p-4 border-red-500/20" id="wdCard-${w.id}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="text-xs font-bold text-red-400 font-display">Withdrawal Request</div>
                        <div class="text-[10px] text-slate-400">${w.profiles?.username || '—'} · ${w.profiles?.phone || '—'}</div>
                    </div>
                    <div class="text-lg font-black text-white font-display">₦${fmt(Number(w.amount))}</div>
                </div>
                <div class="bg-navy-950 rounded-xl p-3 mb-3 text-xs text-slate-400 space-y-1">
                    <div class="flex justify-between"><span>Net Disbursement:</span><span class="text-white font-bold">₦${fmt(w.net_amount)}</span></div>
                    <div class="flex justify-between"><span>Processing Fee:</span><span>₦${fmt(w.fee_amount)}</span></div>
                    <div class="flex justify-between"><span>Beneficiary Bank:</span><span>${w.bank_name || '—'}</span></div>
                    <div class="flex justify-between"><span>NUBAN:</span><span class="font-mono text-white">${w.account_number || '—'}</span></div>
                    <div class="flex justify-between"><span>Beneficiary:</span><span>${w.account_name || '—'}</span></div>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="approveWithdrawal('${w.id}', '${w.user_id}', ${w.amount})" class="flex-1 btn-primary-gradient text-white font-bold py-2.5 rounded-xl text-xs hover:opacity-90 transition">Approve & Mark Paid</button>
                    <button type="button" onclick="declineWithdrawal('${w.id}', '${w.user_id}', ${w.amount})" class="flex-1 bg-red-500/20 text-red-400 font-bold py-2.5 rounded-xl text-xs hover:bg-red-500/30 transition">Decline & Refund</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Failed to load withdrawals</div>';
    }
}

async function loadAdminSettingsForm() {
    if (!appSettings) return;
    document.getElementById('settingTelegram').value = appSettings.telegram_link || '';
    document.getElementById('settingCompany').value = appSettings.company_description || '';
    document.getElementById('settingBankName').value = appSettings.deposit_bank_name || '';
    document.getElementById('settingAccNum').value = appSettings.deposit_account_number || '';
    document.getElementById('settingAccName').value = appSettings.deposit_account_name || '';
    document.getElementById('settingWithdrawalFee').value = appSettings.withdrawal_fee_percent || 15;
    document.getElementById('settingRefA').value = appSettings.referral_level_a_percent || 10;
    document.getElementById('settingRefB').value = appSettings.referral_level_b_percent || 3;
    document.getElementById('settingRefC').value = appSettings.referral_level_c_percent || 1;
    document.getElementById('settingStartHour').value = appSettings.withdrawal_start_hour || 9;
    document.getElementById('settingEndHour').value = appSettings.withdrawal_end_hour || 17;
    document.getElementById('settingAnnouncement').value = appSettings.announcement || '';
}

async function saveAdminSettings() {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    const updates = {
        telegram_link: document.getElementById('settingTelegram').value,
        company_description: document.getElementById('settingCompany').value,
        deposit_bank_name: document.getElementById('settingBankName').value,
        deposit_account_number: document.getElementById('settingAccNum').value,
        deposit_account_name: document.getElementById('settingAccName').value,
        withdrawal_fee_percent: parseFloat(document.getElementById('settingWithdrawalFee').value) || 15,
        referral_level_a_percent: parseFloat(document.getElementById('settingRefA').value) || 10,
        referral_level_b_percent: parseFloat(document.getElementById('settingRefB').value) || 3,
        referral_level_c_percent: parseFloat(document.getElementById('settingRefC').value) || 1,
        withdrawal_start_hour: parseInt(document.getElementById('settingStartHour').value) || 9,
        withdrawal_end_hour: parseInt(document.getElementById('settingEndHour').value) || 17,
        announcement: document.getElementById('settingAnnouncement').value
    };
    toggleLoader(true, 'Saving System Settings...');
    try {
        const { error } = await supabase.from('admin_settings').upsert({ id: 1, ...updates });
        if (error) throw error;
        showToast('✅ Settings successfully updated');
        await loadAppSettings();
    } catch (e) { showToast('❌ ' + (e.message || 'Save failed')); }
    toggleLoader(false);
}

async function loadAdminNewFeaturesData() {
    if (!supabase || !currentUser || currentUser.role !== 'admin') return;
    await Promise.all([
        loadAdminWealthOverview(),
        loadAdminLuckyHeartOverview()
    ]);
}

async function loadAdminWealthOverview() {
    const plansEl = document.getElementById('adminWealthPlansList');
    const positionsEl = document.getElementById('adminWealthPositionsList');
    if (!plansEl || !positionsEl || !supabase || !currentUser || currentUser.role !== 'admin') return;
    try {
        const { data, error } = await supabase.rpc('admin_get_wealth_center_overview', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const state = data || {};
        const plans = Array.isArray(state.plans) ? state.plans : [];
        const positions = Array.isArray(state.recent_positions) ? state.recent_positions : [];

        plansEl.innerHTML = plans.length ? plans.map(p => `
            <div class="bg-navy-950/70 border border-white/5 rounded-xl px-3 py-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${p.plan_name || p.plan_code || 'Wealth Plan'}</div>
                        <div class="text-[9px] text-slate-500 mt-0.5">${fmt(p.min_amount)} — ${fmt(p.max_amount)} · ${p.duration_days} days · ${p.profit_percent}%</div>
                    </div>
                    <span class="text-[8px] uppercase font-black text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 rounded-full px-2 py-1">Active</span>
                </div>
            </div>`).join('') : '<div class="text-center text-slate-500 py-4 text-xs">No active Wealth Center plans.</div>';

        positionsEl.innerHTML = positions.length ? positions.map(p => `
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${p.username || '—'} · ${p.phone || '—'}</div>
                        <div class="text-[9px] text-cyan-300 mt-0.5">${p.plan_name || p.plan_code || 'F/H Wealth Center'}</div>
                    </div>
                    <span class="text-[8px] uppercase font-black px-2 py-1 rounded-full border ${p.status === 'settled' ? 'text-slate-400 bg-white/5 border-white/10' : p.maturity_ready ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' : 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20'}">${p.status === 'settled' ? 'Settled' : p.maturity_ready ? 'Matured' : 'Active'}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-3 text-[9px]">
                    <div class="bg-navy-900/80 rounded-lg p-2"><div class="text-slate-500 uppercase">Principal</div><div class="text-white font-black mt-1">₦${fmt(p.principal)}</div></div>
                    <div class="bg-navy-900/80 rounded-lg p-2"><div class="text-slate-500 uppercase">Profit</div><div class="text-emerald-300 font-black mt-1">₦${fmt(p.expected_profit)}</div></div>
                    <div class="bg-navy-900/80 rounded-lg p-2"><div class="text-slate-500 uppercase">Progress</div><div class="text-cyan-300 font-black mt-1">${Math.round(Number(p.progress_percent || 0))}%</div></div>
                </div>
            </div>`).join('') : '<div class="text-center text-slate-500 py-4 text-xs">No Wealth Center positions yet.</div>';
    } catch (e) {
        plansEl.innerHTML = '<div class="text-center text-red-400 py-4 text-xs">Unable to load Wealth Center overview.</div>';
        positionsEl.innerHTML = '<div class="text-center text-red-400 py-4 text-xs">Unable to load Wealth Center records.</div>';
        console.error('Admin Wealth Center overview error:', e);
    }
}

async function loadAdminLuckyHeartOverview() {
    const statsEl = document.getElementById('adminLuckyHeartStats');
    const listEl = document.getElementById('adminLuckyHeartSpinsList');
    const qualsEl = document.getElementById('adminLuckyHeartQualsList');
    if (!statsEl || !listEl || !qualsEl || !supabase || !currentUser || currentUser.role !== 'admin') return;
    try {
        const { data, error } = await supabase.rpc('admin_get_lucky_heart_overview', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const state = data || {};
        const stats = state.stats || {};
        const spins = Array.isArray(state.recent_spins) ? state.recent_spins : [];
        const quals = Array.isArray(state.today_qualifications) ? state.today_qualifications : [];

        statsEl.innerHTML = `
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3 text-center"><div class="text-[8px] text-slate-500 uppercase tracking-wider">Today's Qualifiers</div><div class="text-xl font-black text-pink-300 mt-1">${Number(stats.today_qualifications || 0)}</div></div>
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3 text-center"><div class="text-[8px] text-slate-500 uppercase tracking-wider">Today's Spins</div><div class="text-xl font-black text-white mt-1">${Number(stats.today_spins || 0)}</div></div>
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3 text-center"><div class="text-[8px] text-slate-500 uppercase tracking-wider">Today's Rewards</div><div class="text-xl font-black text-emerald-300 mt-1">₦${fmt(stats.today_reward_total || 0)}</div></div>`;

        spinsEl.innerHTML = spins.length ? spins.map(r => `
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="min-w-0"><div class="text-xs font-bold text-white truncate">${r.username || '—'} · ${r.phone || '—'}</div><div class="text-[9px] text-slate-500 mt-0.5">${r.prize_label || 'Lucky Heart'} · ${r.created_at ? new Date(r.created_at).toLocaleString('en-NG') : '—'}</div></div>
                <div class="text-right flex-shrink-0"><div class="text-sm font-black text-emerald-300">+₦${fmt(r.reward)}</div><div class="text-[8px] text-slate-500">${Number(r.qualifying_referrals_at_spin || 0)} qualifying</div></div>
            </div>`).join('') : '<div class="text-center text-slate-500 py-4 text-xs">No Lucky Heart spins yet.</div>';

        qualsEl.innerHTML = quals.length ? quals.map(r => `
            <div class="bg-navy-950/70 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="min-w-0"><div class="text-xs font-bold text-white truncate">${r.promoter_username || '—'} → ${r.referred_username || '—'}</div><div class="text-[9px] text-slate-500 mt-0.5">${r.referred_phone || '—'} · VIP${Number(r.vip_level || 0)}</div></div>
                <div class="text-[9px] text-slate-500 text-right flex-shrink-0">${r.qualified_at ? new Date(r.qualified_at).toLocaleTimeString('en-NG', {hour:'2-digit', minute:'2-digit'}) : '—'}</div>
            </div>`).join('') : '<div class="text-center text-slate-500 py-4 text-xs">No qualifying VIP referrals today.</div>';
    } catch (e) {
        statsEl.innerHTML = '<div class="col-span-3 text-center text-red-400 py-4 text-xs">Unable to load Lucky Heart overview.</div>';
        listEl.innerHTML = '<div class="text-center text-red-400 py-4 text-xs">Unable to load Lucky Heart spins.</div>';
        qualsEl.innerHTML = '<div class="text-center text-red-400 py-4 text-xs">Unable to load Lucky Heart qualifications.</div>';
        console.error('Admin Lucky Heart overview error:', e);
    }
}

function switchAdminTab(tab) {
    const panels = ['users', 'deposits', 'withdrawals', 'giftcodes', 'newfeatures', 'settings'];
    panels.forEach(p => {
        const panelEl = document.getElementById('adminPanel' + p.charAt(0).toUpperCase() + p.slice(1));
        if (panelEl) panelEl.classList.toggle('hidden', p !== tab);
        const btn = document.getElementById('adminTab' + (p === 'deposits' ? 'Dep' : p === 'withdrawals' ? 'Wd' : p === 'giftcodes' ? 'Giftcodes' : p === 'newfeatures' ? 'Newfeatures' : p.charAt(0).toUpperCase() + p.slice(1)));
        if (btn) {
            if (p === tab) { btn.classList.add('bg-blue-600', 'text-white', 'shadow-md'); btn.classList.remove('text-slate-400'); }
            else { btn.classList.remove('bg-blue-600', 'text-white', 'shadow-md'); btn.classList.add('text-slate-400'); }
        }
    });
}

// Admin Deposit Approval Handler (Activates plan, returns previous VIP capital on upgrade, & triggers referral commissions)
async function approveDeposit(depositId, userId, amount) {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    toggleLoader(true, 'Activating VIP tier & ledger...');
    try {
        const { data: dep, error: depFetchErr } = await supabase
            .from('deposits')
            .select('*')
            .eq('id', depositId)
            .single();

        if (depFetchErr || !dep || dep.status !== 'pending') {
            toggleLoader(false);
            return showToast('Deposit has already been processed');
        }

        if (vipTiers.length === 0) await loadVipTiers();
        
        const tier = vipTiers.find(t => (t.name && dep.stage_name && t.name.toLowerCase() === dep.stage_name.toLowerCase()) || Number(t.cost) === Number(dep.amount));
        const depositAmt = Number(dep.amount || amount);

        const { data: profile, error: profFetchErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profFetchErr || !profile) {
            toggleLoader(false);
            throw new Error('User profile not found for approval');
        }

        // Determine if this is a VIP upgrade from an existing active VIP
        const currentPlanLevel = parseInt(profile.current_plan_id || 0);
        const previousTier = currentPlanLevel >= 1 && currentPlanLevel <= 9
            ? (vipTiers.find(t => t.level === currentPlanLevel) || VIP_CONFIG[currentPlanLevel])
            : null;

        const isUpgrade = Boolean(previousTier && tier && tier.level > previousTier.level);
        const previousCapital = isUpgrade && previousTier ? Number(previousTier.cost) : 0;

        // Anti-double-refund & race condition guard: conditionally update deposit status only if still 'pending'
        const { data: updatedDep, error: depUpdErr } = await supabase
            .from('deposits')
            .update({ status: 'confirmed' })
            .eq('id', depositId)
            .eq('status', 'pending')
            .select();

        if (depUpdErr || !updatedDep || updatedDep.length === 0) {
            toggleLoader(false);
            return showToast('Deposit has already been processed');
        }

        const newTotalDep = parseFloat(profile.total_deposits || 0) + depositAmt;

        if (isUpgrade) {
            // Upgrade flow:
            // 1. Target VIP becomes active
            // 2. Locked capital becomes full target VIP capital
            // 3. Previous VIP capital returned to user's available balance
            const currentBal = parseFloat(profile.balance || 0);
            const newBal = currentBal + previousCapital;
            const newLocked = tier ? Number(tier.cost) : depositAmt;

            const { error: profUpdErr } = await supabase
                .from('profiles')
                .update({
                    balance: newBal,
                    locked_capital: newLocked,
                    total_deposits: newTotalDep,
                    current_plan_id: tier ? tier.level : currentPlanLevel
                })
                .eq('id', userId);

            if (profUpdErr) throw profUpdErr;

            // Record capital return in public.history
            const tierLabel = previousTier.name && previousTier.name.includes(' ')
                ? previousTier.name
                : (previousTier.name ? previousTier.name.replace('VIP', 'VIP ') : `VIP ${previousTier.level}`);
            const returnDesc = `${tierLabel} Capital Returned → +₦${fmt(previousCapital)}`;

            try {
                const { error: rRetErr } = await supabase.rpc('insert_history', {
                    p_user_id: userId,
                    p_type: 'refund',
                    p_amount: previousCapital,
                    p_description: returnDesc,
                    p_status: 'confirmed'
                });
                if (rRetErr) {
                    await supabase.from('history').insert([{
                        user_id: userId,
                        type: 'refund',
                        amount: previousCapital,
                        description: returnDesc,
                        status: 'confirmed'
                    }]);
                }
            } catch (retHistErr) {
                console.error('History log error on capital return:', retHistErr);
            }
        } else {
            // First-time VIP deposit flow (Initial deposit, no previous VIP active)
            const newLocked = tier ? Number(tier.cost) : Math.max(parseFloat(profile.locked_capital || 0), depositAmt);

            const { error: profUpdErr } = await supabase
                .from('profiles')
                .update({
                    locked_capital: newLocked,
                    total_deposits: newTotalDep,
                    current_plan_id: tier ? tier.level : null
                })
                .eq('id', userId);

            if (profUpdErr) throw profUpdErr;
        }

        // Record deposit approval in history
        try {
            const dDesc = `Deposit Approved — ₦${fmt(depositAmt)} (${dep.stage_name || (tier ? tier.name : 'VIP')})`;
            const { error: rpcErr } = await supabase.rpc('insert_history', {
                p_user_id: userId,
                p_type: 'deposit',
                p_amount: depositAmt,
                p_description: dDesc,
                p_status: 'confirmed'
            });
            if (rpcErr) {
                await supabase.from('history').insert([{
                    user_id: userId,
                    type: 'deposit',
                    amount: depositAmt,
                    description: dDesc,
                    status: 'confirmed'
                }]);
            }
        } catch (histErr) {
            console.error('History log error on deposit approval:', histErr);
        }

        // Upstream referral accounting (Level 1 = 10%, Level 2 = 3%, Level 3 = 1%) on depositAmt only
        await distributeDepositReferralCommissions(userId, depositAmt, profile.username);

        if (currentUser && userId === currentUser.id) {
            const { data: updated } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (updated) {
                currentUser = updated;
                localStorage.setItem('currentUser', JSON.stringify(updated));
                await refreshUserData();
            }
        }
        document.getElementById(`depCard-${depositId}`)?.remove();
        showToast('✅ Deposit approved and VIP tier active');
    } catch (e) {
        showToast('❌ ' + (e.message || 'Approval failed'));
    }
    toggleLoader(false);
}

async function declineDeposit(depositId, userId, amount) {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    toggleLoader(true);
    try {
        await supabase.from('deposits').update({ status: 'declined' }).eq('id', depositId);
        try {
            await supabase.rpc('insert_history', {
                p_user_id: userId,
                p_type: 'deposit',
                p_amount: amount,
                p_description: `Deposit Declined — ₦${fmt(amount)}`,
                p_status: 'declined'
            });
        } catch (histErr) {
            console.error('History log error on decline deposit:', histErr);
        }
        document.getElementById(`depCard-${depositId}`)?.remove();
        showToast('🚫 Deposit declined');
    } catch (e) { showToast('❌ Error: ' + (e.message || 'Unknown')); }
    toggleLoader(false);
}

// Admin Withdrawal Approval Handler (Amount was already deducted upon user request)
async function approveWithdrawal(withdrawalId, userId, amount) {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    toggleLoader(true);
    try {
        const { data: result, error: approveErr } = await supabase.rpc('approve_withdrawal_atomic', {
            p_withdrawal_id: withdrawalId,
            p_user_id: userId
        });
        if (approveErr) throw approveErr;

        const row = Array.isArray(result) ? result[0] : result;
        const approvedAmount = Number((row && row.amount) ?? amount);

        try {
            await supabase.rpc('insert_history', {
                p_user_id: userId,
                p_type: 'withdrawal',
                p_amount: approvedAmount,
                p_description: `Withdrawal Approved & Paid — ₦${fmt(approvedAmount)}`,
                p_status: 'confirmed'
            });
        } catch (histErr) {
            console.error('History log error on approve withdrawal:', histErr);
        }
        document.getElementById(`wdCard-${withdrawalId}`)?.remove();
        showToast('✅ Withdrawal approved and marked paid');
    } catch (e) { showToast('❌ Approval failed: ' + (e.message || 'Unknown')); }
    toggleLoader(false);
}

// Admin Withdrawal Decline Handler (REFUNDS the reserved amount back to available balance)
async function declineWithdrawal(withdrawalId, userId, amount) {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    toggleLoader(true, 'Refunding reserved balance...');
    try {
        const { data: result, error: declineErr } = await supabase.rpc('decline_withdrawal_atomic', {
            p_withdrawal_id: withdrawalId,
            p_user_id: userId
        });
        if (declineErr) throw declineErr;

        const row = Array.isArray(result) ? result[0] : result;
        const amtNum = Number((row && row.amount) ?? amount);
        const refundedBal = Number((row && row.new_balance) ?? 0);
        const refundedTotalWd = Number((row && row.new_total_withdrawals) ?? 0);

        try {
            const rDesc = `Withdrawal Declined (Refunded) — ₦${fmt(amtNum)}`;
            const { error: rpcErr } = await supabase.rpc('insert_history', {
                p_user_id: userId,
                p_type: 'refund',
                p_amount: amtNum,
                p_description: rDesc,
                p_status: 'confirmed'
            });
            if (rpcErr) {
                await supabase.from('history').insert([{
                    user_id: userId, type: 'refund', amount: amtNum, description: rDesc, status: 'confirmed'
                }]);
            }
        } catch (histErr) {
            console.error('History log error on refund withdrawal:', histErr);
        }

        if (currentUser && userId === currentUser.id) {
            currentUser.balance = refundedBal;
            currentUser.total_withdrawals = refundedTotalWd;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            await refreshUserData();
        }

        document.getElementById(`wdCard-${withdrawalId}`)?.remove();
        showToast('🚫 Withdrawal declined & balance refunded to user');
    } catch (e) { showToast('❌ Error: ' + (e.message || 'Unknown')); }
    toggleLoader(false);
}

async function adminAdjustBalance(userId, amount, type) {
    if (!supabase) return showToast('Connection error. Refresh and try again.');
    try {
        const { data: profile } = await supabase.from('profiles').select('balance').eq('id', userId).single();
        const currentBal = parseFloat(profile.balance || 0);
        const newBal = type === 'credit' ? currentBal + amount : Math.max(0, currentBal - amount);
        await supabase.from('profiles').update({ balance: newBal }).eq('id', userId);
        try {
            await supabase.rpc('insert_history', {
                p_user_id: userId,
                p_type: type === 'credit' ? 'admin_credit' : 'admin_deduction',
                p_amount: amount,
                p_description: `Admin ${type === 'credit' ? 'Credit' : 'Deduction'} — ₦${fmt(amount)}`,
                p_status: 'confirmed'
            });
        } catch (histErr) {
            console.error('History log error on admin adjust:', histErr);
        }
        showToast(`✅ Balance ${type === 'credit' ? 'credited' : 'deducted'}`);
        loadAdminUsers();
    } catch (e) { showToast('❌ Failed: ' + (e.message || 'Unknown')); }
}

async function adminToggleBan(userId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    try {
        await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
        showToast(`User ${newStatus === 'banned' ? 'banned' : 'unbanned'}`);
        loadAdminUsers();
    } catch (e) { showToast('❌ Failed'); }
}

async function adminDeleteUser(userId) {
    if (!confirm('WARNING: This will permanently delete the client and all related records. Continue?')) return;
    toggleLoader(true);
    try {
        await supabase.from('profiles').delete().eq('id', userId);
        showToast('✅ Client profile deleted');
        loadAdminUsers();
    } catch (e) { showToast('❌ Delete failed'); }
    toggleLoader(false);
}

// ========================================================
// REFRESH ACTIVE CLIENT PROFILE DATA
// ========================================================
async function refreshUserData() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (error) throw error;
        currentUser = data;
        localStorage.setItem('currentUser', JSON.stringify(data));
        document.getElementById('welcomeMessage').textContent = `Welcome, ${data.username || 'Client'}`;
        if (document.getElementById('profileBalance')) document.getElementById('profileBalance').textContent = `₦${fmt(data.balance)}`;
        await updateDashboardUI();
    } catch (e) { console.error(e); }
}

// ========================================================
// DAILY SURPRISE GIFT CODE
// ========================================================
function openGiftCodeModal() {
    if (!currentUser) return;
    const modal = document.getElementById('giftCodeModal');
    const input = document.getElementById('giftCodeInput');
    const msg = document.getElementById('giftCodeMessage');
    if (msg) msg.classList.add('hidden');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 120); }
    modal?.classList.remove('hidden');
}

function closeGiftCodeModal() {
    document.getElementById('giftCodeModal')?.classList.add('hidden');
}

function setGiftMessage(text, success = false) {
    const el = document.getElementById('giftCodeMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `mt-3 rounded-xl px-3 py-2 text-[11px] font-semibold text-center ${success ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`;
}

async function claimGiftCode() {
    if (!supabase || !currentUser) return showToast('Please sign in first.');
    const input = document.getElementById('giftCodeInput');
    const btn = document.getElementById('giftClaimBtn');
    const code = (input?.value || '').replace(/\D/g, '').trim();

    if (!getActiveVipTier(currentUser)) {
        return setGiftMessage('An active VIP tier is required before you can claim a gift.');
    }
    if (!/^\d{6,7}$/.test(code)) {
        return setGiftMessage('Enter the valid 6 or 7 digit gift code.');
    }

    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    toggleLoader(true, 'Verifying surprise gift...');
    try {
        const { data, error } = await supabase.rpc('claim_daily_gift_code', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || '',
            p_code: code
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const reward = Number(row?.reward || 0);
        const newBalance = Number(row?.new_balance || 0);

        currentUser.balance = newBalance;
        if (row?.new_total_income !== undefined) currentUser.total_income = Number(row.new_total_income);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await refreshUserData();
        await loadHistory();

        setGiftMessage(`🎁 Gift claimed successfully — +₦${fmt(reward)} added to your balance.`, true);
        showToast(`🎁 Surprise gift claimed: +₦${fmt(reward)}`);
        if (input) input.value = '';
    } catch (e) {
        setGiftMessage((e?.message || 'Gift claim failed.').replace(/^Error:\s*/i, ''));
    } finally {
        toggleLoader(false);
        if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
    }
}

// ========================================================
// ADMIN DAILY SURPRISE GIFT CONTROL
// ========================================================
async function loadAdminGiftData() {
    if (!supabase || !currentUser || currentUser.role !== 'admin') return;
    try {
        const { data, error } = await supabase.rpc('admin_get_today_gift_code', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const codeEl = document.getElementById('adminGiftTodayCode');
        const statusEl = document.getElementById('adminGiftStatus');
        if (row?.code) {
            if (codeEl) codeEl.textContent = row.code;
            if (statusEl) statusEl.textContent = `Generated today · ${Number(row.claim_count || 0)} / 10 successful claims`;
        } else {
            if (codeEl) codeEl.textContent = '—';
            if (statusEl) statusEl.textContent = 'No code generated yet.';
        }
        await loadAdminGiftClaims(row?.gift_code_id || null);
    } catch (e) {
        console.error('Gift admin load error:', e);
        const statusEl = document.getElementById('adminGiftStatus');
        if (statusEl) statusEl.textContent = 'Unable to load today\u2019s gift code.';
        await loadAdminGiftClaims(null);
    }
}

async function adminGenerateTodayGiftCode() {
    if (!supabase || !currentUser || currentUser.role !== 'admin') return;
    const btn = document.getElementById('adminGenerateGiftBtn');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    toggleLoader(true, 'Generating today’s unique gift code...');
    try {
        const { data, error } = await supabase.rpc('admin_generate_today_gift_code', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        document.getElementById('adminGiftTodayCode').textContent = row.code;
        document.getElementById('adminGiftStatus').textContent = 'Ready to post · maximum 10 successful claims';
        showToast('✅ Today’s gift code is ready');
        await loadAdminGiftClaims(row.gift_code_id || null);
    } catch (e) {
        showToast('❌ ' + (e.message || 'Could not generate today’s code'));
    } finally {
        toggleLoader(false);
        if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
    }
}

async function loadAdminGiftClaims(giftCodeId = null) {
    const list = document.getElementById('adminGiftClaimsList');
    const countEl = document.getElementById('adminGiftClaimCount');
    if (!list || !supabase || !currentUser || currentUser.role !== 'admin') return;
    try {
        let codeId = giftCodeId;
        if (!codeId) {
            const { data: codeRow, error: codeErr } = await supabase.rpc('admin_get_today_gift_code', {
                p_admin_id: currentUser.id,
                p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
            });
            if (codeErr) throw codeErr;
            const row = Array.isArray(codeRow) ? codeRow[0] : codeRow;
            codeId = row?.gift_code_id || null;
            if (countEl) countEl.textContent = `${Number(row?.claim_count || 0)} / 10`;
        }
        if (!codeId) {
            if (countEl) countEl.textContent = '0 / 10';
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No claims yet.</div>';
            return;
        }
        const { data, error } = await supabase.rpc('admin_get_gift_claims', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || '',
            p_gift_code_id: codeId
        });
        if (error) throw error;
        const claims = data || [];
        if (countEl) countEl.textContent = `${claims.length} / 10`;
        if (!claims.length) {
            list.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No successful claims yet.</div>';
            return;
        }
        list.innerHTML = claims.map((c, idx) => `
            <div class="bg-navy-950/80 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-300/20 flex items-center justify-center text-amber-300 text-[10px] font-black">${idx + 1}</div>
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${c.username || '—'}</div>
                        <div class="text-[10px] text-slate-500 font-mono truncate">${c.phone || '—'}</div>
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-sm font-black text-emerald-400">+₦${fmt(c.reward)}</div>
                    <div class="text-[9px] text-slate-500">${c.claimed_at ? new Date(c.claimed_at).toLocaleTimeString('en-NG', {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="text-center text-red-400 py-6 text-xs">Unable to load gift claims.</div>';
    }
}

// ========================================================
// ADMIN LIVE USER PRESENCE
// ========================================================
let presenceTimer = null;

async function sendPresenceHeartbeat() {
    if (!supabase || !currentUser || currentUser.role === 'admin') return;
    try {
        await supabase.rpc('record_user_presence', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
    } catch (e) {
        console.debug('Presence heartbeat unavailable:', e?.message || e);
    }
}

async function startPresenceHeartbeat() {
    if (presenceTimer) clearInterval(presenceTimer);
    if (!currentUser || currentUser.role === 'admin') return;
    await sendPresenceHeartbeat();
    presenceTimer = setInterval(sendPresenceHeartbeat, 60000);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser && currentUser.role !== 'admin') {
        sendPresenceHeartbeat();
    }
});

function stopPresenceHeartbeat() {
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
}

async function loadAdminLiveUsers() {
    const list = document.getElementById('adminLiveUsersList');
    const countEl = document.getElementById('adminLiveUserCount');
    if (!list || !supabase || !currentUser || currentUser.role !== 'admin') return;
    try {
        const { data, error } = await supabase.rpc('admin_get_live_users', {
            p_admin_id: currentUser.id,
            p_admin_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const users = data || [];
        if (countEl) countEl.textContent = users.length;
        if (!users.length) {
            list.innerHTML = '<div class="text-center text-slate-500 py-3 text-[10px]">No users currently online.</div>';
            return;
        }
        list.innerHTML = users.map(u => `
            <div class="flex items-center justify-between gap-3 bg-navy-950/70 border border-white/5 rounded-xl px-3 py-2">
                <div class="min-w-0">
                    <div class="text-xs font-bold text-white truncate">${u.username || '—'}</div>
                    <div class="text-[9px] text-slate-500 font-mono truncate">${u.phone || '—'}</div>
                </div>
                <div class="flex items-center gap-1.5 text-[9px] text-emerald-400 font-bold uppercase">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                </div>
            </div>
        `).join('');
    } catch (e) {
        if (countEl) countEl.textContent = '—';
        list.innerHTML = '<div class="text-center text-red-400 py-3 text-[10px]">Unable to load live presence.</div>';
        console.error('Live presence load error:', e);
    }
}

function startAdminLiveRefresh() {
    if (window.adminLiveRefreshTimer) clearInterval(window.adminLiveRefreshTimer);
    loadAdminLiveUsers();
    window.adminLiveRefreshTimer = setInterval(loadAdminLiveUsers, 60000);
}

function stopAdminLiveRefresh() {
    if (window.adminLiveRefreshTimer) {
        clearInterval(window.adminLiveRefreshTimer);
        window.adminLiveRefreshTimer = null;
    }
}

// ========================================================
// WHATSAPP MODAL POPUP
// ========================================================
function openTelegramPopup() {
    document.getElementById('telegramPopup').classList.remove('hidden');
}
function closeTelegramPopup() {
    document.getElementById('telegramPopup').classList.add('hidden');
}


// ========================================================
// F/H WEALTH CENTER
// ========================================================
const WEALTH_CENTER_PLANS = [
    { code: 'FH1', name: 'F/H Wealth Center 1', min: 2000, max: 200000, days: 5, profit: 5.3 },
    { code: 'FH2', name: 'F/H Wealth Center 2', min: 3000, max: 300000, days: 15, profit: 6.8 },
    { code: 'FH3', name: 'F/H Wealth Center 3', min: 10000, max: 800000, days: 30, profit: 8.0 }
];

function getWealthPlanByCode(code) {
    return WEALTH_CENTER_PLANS.find(p => p.code === code) || null;
}

function wealthEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-NG');
}

function getActiveNewFeatureVipTier(user) {
    const tier = getActiveVipTier(user);
    return tier && Number(tier.level) >= 1 && Number(tier.level) <= 6 ? tier : null;
}

function updateVipFeatureVisibility() {
    const wrap = document.getElementById('newVipFeatures');
    if (!wrap) return;
    const active = Boolean(getActiveNewFeatureVipTier(currentUser));
    wrap.classList.toggle('hidden', !active);
}

function renderWealthPlanCards(plans) {
    const grid = document.getElementById('wealthPlanGrid');
    if (!grid) return;
    grid.innerHTML = plans.map(plan => `
        <div class="wealth-plan-card glass-panel rounded-2xl p-5 border-cyan-500/15 bg-gradient-to-b from-navy-850 to-navy-950 flex flex-col">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-[9px] font-black tracking-[0.18em] text-cyan-300 uppercase font-display">${wealthEsc(plan.code)}</div>
                    <div class="text-sm font-black text-white mt-1 font-display">${wealthEsc(plan.name)}</div>
                </div>
                <div class="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-300/20 flex items-center justify-center text-cyan-300"><i class="ph-fill ph-chart-line-up"></i></div>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-4">
                <div class="bg-navy-950/80 rounded-xl p-2.5 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold">Min</div><div class="text-[11px] font-black text-white mt-1">₦${fmt(plan.min)}</div></div>
                <div class="bg-navy-950/80 rounded-xl p-2.5 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold">Days</div><div class="text-[11px] font-black text-white mt-1">${plan.days}</div></div>
                <div class="bg-navy-950/80 rounded-xl p-2.5 border border-white/5 text-center"><div class="text-[8px] text-slate-500 uppercase font-bold">Profit</div><div class="text-[11px] font-black text-cyan-300 mt-1">${plan.profit}%</div></div>
            </div>
            <div class="mt-3 text-[9px] text-slate-500 leading-relaxed">Allowed amount: ₦${fmt(plan.min)} — ₦${fmt(plan.max)}</div>
            <div class="mt-4 glass-input rounded-xl px-3 py-2.5 flex items-center gap-2">
                <span class="text-slate-500 text-xs">₦</span>
                <input type="number" id="wealthAmount-${wealthEsc(plan.code)}" min="${plan.min}" max="${plan.max}" step="1" value="${plan.min}" class="bg-transparent w-full outline-none text-white text-sm font-bold" inputmode="numeric">
            </div>
            <button type="button" onclick="startWealthPlan('${wealthEsc(plan.code)}')" class="btn-primary-gradient w-full h-11 rounded-xl mt-3 text-xs font-black text-white flex items-center justify-center gap-2 active:scale-[0.98] transition"><i class="ph-bold ph-lock-key-open"></i> Start Plan</button>
        </div>
    `).join('');
}

function renderWealthPositions(positions) {
    const list = document.getElementById('wealthPositionsList');
    if (!list) return;
    if (!positions || positions.length === 0) {
        list.innerHTML = '<div class="glass-panel rounded-2xl p-6 text-center text-xs text-slate-500 border-white/5">No Wealth Center plans yet.</div>';
        return;
    }
    list.innerHTML = positions.map(pos => {
        const percent = Math.max(0, Math.min(100, Number(pos.progress_percent || 0)));
        const maturityReady = Boolean(pos.maturity_ready);
        const settled = pos.status === 'settled';
        const status = settled ? 'Settled' : maturityReady ? 'Matured' : 'Active';
        const statusClass = settled ? 'text-slate-400 bg-white/5 border-white/10' : maturityReady ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' : 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20';
        const progressDeg = `${(percent * 3.6).toFixed(2)}deg`;
        const claimButton = maturityReady && !settled ? `<button type="button" onclick="claimWealthCenterMaturity('${wealthEsc(pos.id)}')" class="btn-primary-gradient w-full h-11 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 mt-4"><i class="ph-bold ph-hand-coins"></i> Claim Principal + Profit</button>` : '';
        return `
            <div class="glass-panel rounded-3xl p-5 sm:p-6 border-white/10 bg-gradient-to-br from-navy-850 to-navy-950">
                <div class="flex flex-col sm:flex-row gap-5 sm:items-center">
                    <div class="flex items-center justify-center">
                        <div class="wealth-progress-circle" style="--progress:${progressDeg};">
                            <div class="wealth-progress-circle-inner">
                                <div class="wealth-progress-percent">${Math.round(percent)}%</div>
                                <div class="wealth-progress-label">Progress</div>
                            </div>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <div class="text-[9px] font-black tracking-[0.2em] text-cyan-300 uppercase font-display">${wealthEsc(pos.plan_name || pos.plan_code || 'F/H Wealth Center')}</div>
                                <div class="text-base sm:text-lg font-black text-white mt-1">${wealthEsc(pos.duration_days)}-Day Plan</div>
                            </div>
                            <span class="text-[8px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full border ${statusClass}">${status}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mt-4">
                            <div class="bg-navy-950/80 rounded-xl p-3 border border-white/5"><div class="text-[8px] text-slate-500 uppercase font-bold">Start</div><div class="text-[10px] text-white font-semibold mt-1">${formatDateTime(pos.start_at)}</div></div>
                            <div class="bg-navy-950/80 rounded-xl p-3 border border-white/5"><div class="text-[8px] text-slate-500 uppercase font-bold">Maturity</div><div class="text-[10px] text-white font-semibold mt-1">${formatDateTime(pos.maturity_at)}</div></div>
                            <div class="bg-navy-950/80 rounded-xl p-3 border border-white/5"><div class="text-[8px] text-slate-500 uppercase font-bold">Accrued Profit</div><div class="text-[10px] text-cyan-300 font-black mt-1">₦${fmt(pos.accrued_profit)}</div></div>
                            <div class="bg-navy-950/80 rounded-xl p-3 border border-white/5"><div class="text-[8px] text-slate-500 uppercase font-bold">Maturity Profit</div><div class="text-[10px] text-emerald-300 font-black mt-1">₦${fmt(pos.expected_profit)}</div></div>
                        </div>
                        <div class="flex items-center justify-between mt-3 text-[9px] text-slate-500"><span>${wealthEsc(pos.remaining_label || '')}</span><span>${Number(pos.profit_percent || 0)}% total profit</span></div>
                        ${claimButton}
                    </div>
                </div>
            </div>`;
    }).join('');
}

async function loadWealthCenterPage() {
    const noVip = document.getElementById('wealthNoVipState');
    const activeState = document.getElementById('wealthActiveState');
    const grid = document.getElementById('wealthPlanGrid');
    const list = document.getElementById('wealthPositionsList');
    if (!currentUser) return;
    const tier = getActiveNewFeatureVipTier(currentUser);
    if (!tier) {
        noVip?.classList.remove('hidden');
        activeState?.classList.add('hidden');
        return;
    }
    noVip?.classList.add('hidden');
    activeState?.classList.remove('hidden');
    if (!supabase) return;
    if (grid) grid.innerHTML = '<div class="md:col-span-3 text-center py-8 text-xs text-slate-500">Loading wealth plans...</div>';
    if (list) list.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">Loading your wealth plans...</div>';
    try {
        const { data, error } = await supabase.rpc('get_wealth_center_state', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const state = data || {};
        renderWealthPlanCards(state.plans || WEALTH_CENTER_PLANS);
        renderWealthPositions(state.positions || []);
    } catch (e) {
        console.error('Wealth Center load error:', e);
        if (grid) grid.innerHTML = '<div class="md:col-span-3 text-center py-8 text-xs text-red-400">Unable to load Wealth Center right now.</div>';
        if (list) list.innerHTML = '<div class="text-center py-8 text-xs text-red-400">Unable to load your wealth plans.</div>';
    }
}

async function startWealthPlan(planCode) {
    if (!supabase || !currentUser) return showToast('Please sign in first.');
    if (!getActiveNewFeatureVipTier(currentUser)) return showToast('An active VIP1–VIP6 plan is required.');
    const plan = getWealthPlanByCode(planCode);
    const input = document.getElementById(`wealthAmount-${planCode}`);
    const amount = Number(input?.value || 0);
    if (!plan) return showToast('Invalid Wealth Center plan.');
    if (!Number.isFinite(amount) || amount < plan.min || amount > plan.max) {
        return showToast(`Enter an amount between ₦${fmt(plan.min)} and ₦${fmt(plan.max)}.`);
    }
    toggleLoader(true, 'Starting F/H Wealth Center plan...');
    try {
        const { data, error } = await supabase.rpc('start_wealth_center', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || '',
            p_plan_code: planCode,
            p_amount: amount
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.new_balance !== undefined) currentUser.balance = Number(row.new_balance);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await refreshUserData();
        await loadWealthCenterPage();
        showToast(`✅ ${plan.name} started successfully.`);
    } catch (e) {
        showToast('❌ ' + (e.message || 'Unable to start Wealth Center plan'));
    } finally {
        toggleLoader(false);
    }
}

async function claimWealthCenterMaturity(positionId) {
    if (!supabase || !currentUser) return showToast('Please sign in first.');
    if (!confirm('Claim this matured Wealth Center plan and credit the principal plus profit to your available balance?')) return;
    toggleLoader(true, 'Settling Wealth Center maturity...');
    try {
        const { data, error } = await supabase.rpc('claim_wealth_center_maturity', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || '',
            p_position_id: positionId
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.new_balance !== undefined) currentUser.balance = Number(row.new_balance);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await refreshUserData();
        await loadWealthCenterPage();
        await loadHistory();
        showToast(`✅ Wealth Center matured: +₦${fmt(row?.settled_amount || 0)} credited.`);
    } catch (e) {
        showToast('❌ ' + (e.message || 'Unable to settle Wealth Center maturity'));
    } finally {
        toggleLoader(false);
    }
}

// ========================================================
// LUCKY HEART ❤️
// ========================================================
let luckyHeartRotation = 0;
let luckyHeartBusy = false;

function setLuckyHeartMessage(text, success = false) {
    const el = document.getElementById('luckyHeartMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `mt-5 rounded-2xl px-4 py-3 text-xs font-semibold text-center ${success ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300' : 'bg-red-500/10 border border-red-400/20 text-red-300'}`;
}

function renderLuckyHeartHistory(rows) {
    const list = document.getElementById('luckyHeartHistoryList');
    if (!list) return;
    if (!rows || rows.length === 0) {
        list.innerHTML = '<div class="text-center text-slate-500 py-5 text-xs">No Lucky Heart spins yet.</div>';
        return;
    }
    list.innerHTML = rows.map(r => `
        <div class="flex items-center justify-between gap-3 bg-navy-950/70 border border-white/5 rounded-xl px-3 py-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-400/20 flex items-center justify-center text-pink-300"><i class="ph-fill ph-heart"></i></div>
                <div class="min-w-0"><div class="text-xs font-bold text-white truncate">Lucky Heart</div><div class="text-[9px] text-slate-500">${formatDateTime(r.created_at)}</div></div>
            </div>
            <div class="text-sm font-black text-emerald-300">+₦${fmt(r.reward)}</div>
        </div>`).join('');
}

async function loadLuckyHeartPage() {
    if (!currentUser) return;
    const tier = getActiveNewFeatureVipTier(currentUser);
    const btn = document.getElementById('luckyHeartSpinBtn');
    if (!tier) {
        if (btn) btn.disabled = true;
        setLuckyHeartMessage('An active VIP1–VIP6 plan is required for Lucky Heart.');
        return;
    }
    if (!supabase) return;
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabase.rpc('get_lucky_heart_state', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const state = data || {};
        document.getElementById('luckyHeartEarned').textContent = Number(state.spins_earned || 0);
        document.getElementById('luckyHeartUsed').textContent = Number(state.spins_used || 0);
        document.getElementById('luckyHeartRemaining').textContent = Number(state.spins_remaining || 0);
        document.getElementById('luckyHeartQualificationText').textContent = `${Number(state.qualifying_referrals || 0)} qualifying VIP activations recorded today.`;
        renderLuckyHeartHistory(state.recent_spins || []);
        if (Number(state.spins_remaining || 0) <= 0) {
            setLuckyHeartMessage('No Lucky Heart spins are available right now. A qualifying direct VIP activation today creates a new spin.');
        } else {
            const el = document.getElementById('luckyHeartMessage');
            if (el) el.className = 'hidden';
        }
        if (btn) btn.disabled = Number(state.spins_remaining || 0) <= 0;
    } catch (e) {
        console.error('Lucky Heart load error:', e);
        setLuckyHeartMessage('Unable to load Lucky Heart right now.');
        if (btn) btn.disabled = true;
    }
}

async function spinLuckyHeart() {
    if (luckyHeartBusy || !supabase || !currentUser) return;
    if (!getActiveNewFeatureVipTier(currentUser)) return showToast('An active VIP1–VIP6 plan is required.');
    const wheel = document.getElementById('luckyHeartWheel');
    const btn = document.getElementById('luckyHeartSpinBtn');
    luckyHeartBusy = true;
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    setLuckyHeartMessage('Verifying today’s spin entitlement...');
    try {
        const { data, error } = await supabase.rpc('spin_lucky_heart', {
            p_user_id: currentUser.id,
            p_password: currentUser.password || localStorage.getItem('emx_password') || ''
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const reward = Number(row?.reward || 0);
        const segmentIndex = Math.max(0, Math.min(2, Number(row?.segment_index || 1) - 1));
        const segmentCenter = segmentIndex * 36 + 18;
        const currentMod = ((luckyHeartRotation % 360) + 360) % 360;
        const align = (360 - segmentCenter - currentMod + 360) % 360;
        luckyHeartRotation += 360 * 6 + align;
        if (wheel) wheel.style.transform = `rotate(${luckyHeartRotation}deg)`;
        await new Promise(resolve => setTimeout(resolve, 4400));
        if (row?.new_balance !== undefined) currentUser.balance = Number(row.new_balance);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await refreshUserData();
        await loadHistory();
        await loadLuckyHeartPage();
        setLuckyHeartMessage(`❤️ Lucky Heart reward: +₦${fmt(reward)} credited to your balance.`, true);
        showToast(`❤️ Lucky Heart: +₦${fmt(reward)}`);
    } catch (e) {
        setLuckyHeartMessage((e?.message || 'Lucky Heart spin failed.').replace(/^Error:\s*/i, ''), false);
        await loadLuckyHeartPage();
    } finally {
        luckyHeartBusy = false;
        if (btn) btn.classList.remove('opacity-60');
    }
}

// ========================================================
// PWA INSTALLATION
// ========================================================
let deferredInstallPrompt = null;

function updatePwaInstallVisibility() {
    const banner = document.getElementById('appInstallBanner');
    if (!banner) return;
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    const dismissed = localStorage.getItem('fh_install_banner_dismissed') === '1';
    banner.classList.toggle('hidden', !deferredInstallPrompt || standalone || iosStandalone || dismissed);
}

async function installFluxHavenApp() {
    if (!deferredInstallPrompt) return showToast('App installation is not available on this browser right now.');
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (_) {}
    deferredInstallPrompt = null;
    updatePwaInstallVisibility();
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updatePwaInstallVisibility();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updatePwaInstallVisibility();
    showToast('✅ Flux Haven installed successfully.');
});

async function registerFluxHavenServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (e) {
        console.debug('Service worker registration unavailable:', e?.message || e);
    }
}

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener('DOMContentLoaded', async () => {
    registerFluxHavenServiceWorker();
    if (!supabase && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    if (!supabase) { showToast('Supabase connection failed. Refresh.'); return; }

    await loadVipTiers();

    const cached = localStorage.getItem('currentUser');
    const rem = localStorage.getItem('emx_remember');

    if (rem === '1') {
        document.getElementById('loginUsername').value = localStorage.getItem('emx_username') || '';
        document.getElementById('loginPassword').value = localStorage.getItem('emx_password') || '';
    }

    if (cached) {
        toggleLoader(true, 'Securing Environment...');
        try {
            const parsed = JSON.parse(cached);
            const { data, error } = await supabase.from('profiles').select('*').eq('id', parsed.id).maybeSingle();
            if (error || !data) throw new Error('Session expired');
            if (data.status === 'banned') throw new Error('Account suspended');

            currentUser = data;
            localStorage.setItem('currentUser', JSON.stringify(data));
            initRealtime();
            await loadAppSettings();
            toggleLoader(false);

            const savedDeposit = sessionStorage.getItem('fh_deposit_flow');
            if (savedDeposit) {
                switchView('depositPage');
                await prepareDepositView();
            } else {
                showHome();
            }
        } catch (e) {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('emx_remember');
            sessionStorage.removeItem('fh_deposit_flow');
            currentUser = null;
            toggleLoader(false);
            switchView('authPage');
            checkReferralLink();
        }
    } else {
        switchView('authPage');
        checkReferralLink();
    }
});

function checkReferralLink() {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
        switchAuthTab('signup');
        document.getElementById('signupReferral').value = refCode;
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

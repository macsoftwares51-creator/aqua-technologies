const $ = id => document.getElementById(id);
let version = 0;
let contentData = {};

async function api(url, options = {}) {
    const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('csrf_token='))?.split('=').slice(1).join('=');
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function makeInput(label, value, className = '') {
    const wrapper = document.createElement('label');
    wrapper.className = className;
    wrapper.append(label);
    const field = document.createElement('input');
    field.value = value || '';
    wrapper.append(field);
    return { wrapper, field };
}

function makeTextarea(label, value, className = '') {
    const wrapper = document.createElement('label');
    wrapper.className = className;
    wrapper.append(label);
    const field = document.createElement('textarea');
    field.value = value || '';
    field.rows = 3;
    wrapper.append(field);
    return { wrapper, field };
}

function renderServices() {
    const editor = $('servicesEditor');
    editor.replaceChildren();
    (contentData.services || []).forEach((service, index) => {
        const row = document.createElement('div');
        row.className = 'editor-row';
        const title = makeInput('Title', service.title);
        const icon = makeInput('Icon class', service.icon || 'fa-solar-panel');
        const description = makeTextarea('Description', service.description, 'wide');
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'danger small'; remove.textContent = 'Remove';
        remove.addEventListener('click', () => { contentData.services.splice(index, 1); renderServices(); });
        row.append(title.wrapper, icon.wrapper, description.wrapper, remove);
        row._fields = { title: title.field, icon: icon.field, description: description.field };
        editor.append(row);
    });
}

function renderProjects() {
    const editor = $('projectsEditor');
    editor.replaceChildren();
    (contentData.projects || []).forEach((project, index) => {
        const row = document.createElement('div');
        row.className = 'editor-row project-editor-row';
        const description = makeInput('Description', project.description, 'wide');
        const client = makeInput('Client', project.client);
        const value = makeInput('Value (Ksh)', project.value);
        const year = makeInput('Year', project.year);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'danger small'; remove.textContent = 'Remove';
        remove.addEventListener('click', () => { contentData.projects.splice(index, 1); renderProjects(); });
        row.append(description.wrapper, client.wrapper, value.wrapper, year.wrapper, remove);
        row._fields = { description: description.field, client: client.field, value: value.field, year: year.field };
        editor.append(row);
    });
}

function renderEditors() {
    const contact = contentData.contact || {};
    $('contactName').value = contentData.brand?.name || '';
    $('contactTagline').value = contentData.brand?.tagline || '';
    $('contactEmail').value = contact.email || '';
    $('contactPhone').value = contact.phone || '';
    $('contactWhatsapp').value = contact.whatsapp || '';
    $('contactWebsite').value = contact.website || '';
    $('contactAddress').value = contact.address || '';
    $('contactPoBox').value = contact.poBox || '';
    renderServices();
    renderProjects();
}

function collectEditors() {
    contentData.brand = { ...(contentData.brand || {}), name: $('contactName').value.trim(), tagline: $('contactTagline').value.trim() };
    contentData.contact = { ...(contentData.contact || {}), email: $('contactEmail').value.trim(), phone: $('contactPhone').value.trim(), whatsapp: $('contactWhatsapp').value.trim(), website: $('contactWebsite').value.trim(), address: $('contactAddress').value.trim(), poBox: $('contactPoBox').value.trim() };
    contentData.services = [...$('servicesEditor').children].map(row => ({ title: row._fields.title.value.trim(), icon: row._fields.icon.value.trim(), description: row._fields.description.value.trim() })).filter(service => service.title);
    contentData.projects = [...$('projectsEditor').children].map(row => ({ description: row._fields.description.value.trim(), client: row._fields.client.value.trim(), value: row._fields.value.value.trim(), year: row._fields.year.value.trim() })).filter(project => project.description);
    return contentData;
}

async function saveContent(source = 'structured') {
    $('saveMessage').textContent = '';
    try {
        const nextContent = source === 'json' ? JSON.parse($('content').value) : collectEditors();
        const data = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify({ content: nextContent, version }) });
        contentData = data.content; version = data.version;
        $('content').value = JSON.stringify(contentData, null, 2);
        renderEditors();
        $('saveMessage').style.color = '#247a45';
        $('saveMessage').textContent = `Saved version ${version}.`;
        loadAudit();
    } catch (error) {
        $('saveMessage').style.color = '#a33227';
        $('saveMessage').textContent = error.message;
    }
}

async function loadContent() {
    try {
        const data = await api('/api/admin/content');
        version = data.version; contentData = data.content;
        $('content').value = JSON.stringify(contentData, null, 2);
        renderEditors();
    } catch (error) { $('saveMessage').textContent = error.message; }
}

async function loadAudit() {
    try {
        const data = await api('/api/admin/audit');
        const list = $('audit');
        list.replaceChildren();
        if (!data.entries.length) { const empty = document.createElement('li'); empty.textContent = 'No changes yet'; list.append(empty); return; }
        data.entries.forEach(entry => { const item = document.createElement('li'); item.textContent = `${entry.action} · ${new Date(entry.createdAt).toLocaleString()}`; list.append(item); });
    } catch {}
}

function renderReviewQueue(reviews) {
    const list = $('reviewsAdmin');
    list.replaceChildren();
    if (!reviews.length) { list.textContent = 'No reviews submitted yet.'; return; }
    reviews.forEach(review => {
        const item = document.createElement('article'); item.className = `admin-review ${review.approved ? 'approved' : 'pending'}`;
        const heading = document.createElement('strong'); heading.textContent = `${review.name} · ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
        const text = document.createElement('p'); text.textContent = review.comment;
        const status = document.createElement('span'); status.className = 'review-status'; status.textContent = review.approved ? 'Published' : 'Awaiting approval';
        item.append(heading, text, status);
        const actions = document.createElement('div'); actions.className = 'review-actions';
        const change = document.createElement('button'); change.className = review.approved ? 'secondary small' : 'small'; change.textContent = review.approved ? 'Unpublish' : 'Approve';
        change.addEventListener('click', () => updateReview(review._id, review.approved ? 'rejected' : 'approved'));
        const remove = document.createElement('button'); remove.className = 'danger small'; remove.textContent = 'Delete';
        remove.addEventListener('click', () => deleteReview(review._id));
        actions.append(change, remove); item.append(actions); list.append(item);
    });
}

async function loadReviews() { try { const data = await api('/api/admin/reviews'); renderReviewQueue(data.reviews || []); } catch (error) { $('reviewsAdmin').textContent = error.message; } }
async function updateReview(id, status) { try { await api(`/api/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); loadReviews(); } catch (error) { $('reviewsAdmin').textContent = error.message; } }
async function deleteReview(id) { if (!window.confirm('Delete this review permanently?')) return; try { await api(`/api/admin/reviews/${id}`, { method: 'DELETE' }); loadReviews(); } catch (error) { $('reviewsAdmin').textContent = error.message; } }

function showAdmin(user) { $('loginView').hidden = true; $('adminView').hidden = false; $('signedIn').textContent = `Signed in as ${user.username}`; loadContent(); loadAudit(); loadReviews(); }

$('loginForm').addEventListener('submit', async event => { event.preventDefault(); $('loginMessage').textContent = ''; try { showAdmin(await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) })); } catch (error) { $('loginMessage').textContent = error.message; } });
$('logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); });
$('reload').addEventListener('click', loadContent);
$('save').addEventListener('click', () => saveContent('json'));
$('saveStructured').addEventListener('click', () => saveContent('structured'));
$('addService').addEventListener('click', () => { collectEditors(); contentData.services.push({ title: '', icon: 'fa-solar-panel', description: '' }); renderServices(); });
$('addProject').addEventListener('click', () => { collectEditors(); contentData.projects.push({ description: '', client: '', value: '', year: '' }); renderProjects(); });
$('refreshReviews').addEventListener('click', loadReviews);
$('image').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return ($('uploadMessage').textContent = 'Only JPG, PNG or WebP images up to 5 MB are allowed.'); try { const sign = await api('/api/admin/cloudinary-signature', { method: 'POST' }); const form = new FormData(); form.append('file', file); Object.entries(sign).filter(([key]) => ['timestamp', 'folder', 'resource_type', 'allowed_formats', 'max_file_size', 'unique_filename', 'use_filename'].includes(key)).forEach(([key, value]) => form.append(key, Array.isArray(value) ? value.join(',') : value)); form.append('api_key', sign.apiKey); form.append('signature', sign.signature); const result = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: 'POST', body: form }); const uploaded = await result.json(); if (!result.ok) throw new Error('Upload failed'); $('uploadMessage').textContent = 'Uploaded. Copy this URL into brand.logoUrl: ' + uploaded.secure_url; } catch (error) { $('uploadMessage').textContent = error.message; } });
(async () => { try { showAdmin(await api('/api/admin/me')); } catch { $('loginView').hidden = false; } })();

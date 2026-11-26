(() => {
  const TASKS_KEY = 'frameforge.tasks.v1';
  const MIGRATED_KEY = 'frameforge.projectsMigratedToTasks.v1';
  const USER_KEY = 'frameforge.username';
  const LOGIN_KEY = 'frameforge.demoLoggedIn';
  const MEDIA_DB = 'frameforge.media.v1';
  let cloudTasks = null;

  function openMediaDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('attachments', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local media storage.'));
    });
  }

  async function saveAttachments(taskId, files) {
    if (!files.length) return [];
    const db = await openMediaDb();
    const attachments = files.map((file, index) => ({
      id: `${taskId}-media-${index}-${crypto.randomUUID?.() || Date.now()}`,
      taskId,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
    }));
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('attachments', 'readwrite');
        attachments.forEach(item => tx.objectStore('attachments').put(item));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not save attached media.'));
        tx.onabort = () => reject(tx.error || new Error('Saving attached media was cancelled.'));
      });
    } finally { db.close(); }
    return attachments.map(({ id, name, type, size }) => ({ id, name, type, size }));
  }

  async function deleteAttachments(ids) {
    if (!ids?.length) return;
    const db = await openMediaDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('attachments', 'readwrite');
        ids.forEach(id => tx.objectStore('attachments').delete(id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not remove local media.'));
      });
    } finally { db.close(); }
  }

  function parseTasks() {
    if (cloudTasks !== null) return cloudTasks.map(task => ({ ...task }));
    try {
      const rows = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
      return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && typeof row.text === 'string' && ['in-progress', 'done'].includes(row.status)) : [];
    } catch { return []; }
  }

  function saveTasks(tasks) { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); }

  function migrateLegacyProjects() {
    if (localStorage.getItem(MIGRATED_KEY) === 'true') return;
    let projects = [];
    try { projects = JSON.parse(localStorage.getItem('frameforge.projects.v1') || '[]'); } catch {}
    if (Array.isArray(projects) && projects.length) {
      const tasks = parseTasks();
      const seen = new Set(tasks.map(task => task.id));
      projects.forEach(project => {
        if (!project || typeof project.id !== 'string' || seen.has(project.id)) return;
        const text = typeof project.story === 'string' && project.story.trim()
          ? project.story.trim()
          : (project.title || 'Previous project');
        tasks.push({
          id: project.id,
          text,
          status: 'in-progress',
          createdAt: project.createdAt || new Date().toISOString(),
          attachments: Array.isArray(project.attachments) ? project.attachments : [],
        });
      });
      saveTasks(tasks);
    }
    localStorage.setItem(MIGRATED_KEY, 'true');
  }

  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Saved earlier' : `Added ${date.toLocaleDateString()}`;
  };
  const getUser = () => localStorage.getItem(USER_KEY) || 'Guest';
  const isLogged = () => localStorage.getItem(LOGIN_KEY) === 'true';

  function renderSession() {
    const username = document.getElementById('username');
    const login = document.getElementById('login-button');
    const logout = document.getElementById('logout-button');
    const firebaseUser = window.FrameforgeFirebase?.user;
    const logged = Boolean(firebaseUser) || isLogged();
    if (username) username.textContent = firebaseUser?.email || (isLogged() ? getUser() : 'Guest');
    if (login) login.hidden = logged;
    const signup = document.getElementById('signup-button');
    if (signup) signup.hidden = logged;
    if (logout) logout.hidden = !logged;
    const setting = document.getElementById('username-setting');
    if (setting) setting.value = localStorage.getItem(USER_KEY) || '';
  }

  function taskCard(task, done) {
    const card = document.createElement('article');
    card.className = `task-card${done ? ' done-task' : ''}`;
    const text = document.createElement('p');
    text.className = 'task-card-text';
    text.textContent = task.text;
    card.append(text);

    if (task.attachments?.length) {
      const files = document.createElement('p');
      files.className = 'task-attachment-note';
      files.textContent = `▧ ${task.attachments.length} attached file${task.attachments.length === 1 ? '' : 's'} · file data stays on the device where it was added`;
      card.append(files);
    }

    if (task.assistantResult) {
      const result = task.assistantResult;
      const section = document.createElement('section');
      section.className = 'assistant-result';
      const heading = document.createElement('h3');
      heading.textContent = 'Task response';
      section.append(heading);
      if (typeof result.text === 'string') {
        const answer = document.createElement('p');
        answer.className = 'assistant-answer';
        answer.textContent = result.text;
        section.append(answer);
      }
      const safeLink = value => {
        try {
          const url = new URL(value);
          return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
      };
      const mediaExpiry = typeof result.pixabayExpiresAt === 'number' ? result.pixabayExpiresAt : Date.parse(result.pixabayExpiresAt);
      const pixabayMediaAvailable = !result.pixabayExpiresAt || (Number.isFinite(mediaExpiry) && mediaExpiry > Date.now());
      if (pixabayMediaAvailable && Array.isArray(result.images) && result.images.length) {
        const grid = document.createElement('div');
        grid.className = 'assistant-images';
        result.images.slice(0, 5).forEach(image => {
          const page = safeLink(image.pageURL);
          let preview = '';
          try {
            const parsed = new URL(image.previewURL);
            if (parsed.protocol === 'https:' && ['pixabay.com', 'cdn.pixabay.com'].includes(parsed.hostname)) preview = parsed.href;
          } catch {}
          if (!page || !preview) return;
          const link = document.createElement('a');
          link.className = 'assistant-image-link';
          link.href = page;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          const imageElement = document.createElement('img');
          imageElement.src = preview;
          imageElement.alt = String(image.tags || 'Pixabay photo').slice(0, 160);
          imageElement.loading = 'lazy';
          const caption = document.createElement('span');
          caption.textContent = `${String(image.tags || 'Photo').slice(0, 80)} · Pixabay`;
          link.append(imageElement, caption);
          grid.append(link);
        });
        if (grid.childElementCount) section.append(grid);
      }
      if (pixabayMediaAvailable && Array.isArray(result.videos) && result.videos.length) {
        const grid = document.createElement('div');
        grid.className = 'assistant-videos';
        result.videos.slice(0, 5).forEach(item => {
          const page = safeLink(item.pageURL);
          let videoURL = '';
          let thumbnailURL = '';
          try {
            const parsedVideo = new URL(item.videoURL);
            if (parsedVideo.protocol === 'https:' && parsedVideo.hostname === 'cdn.pixabay.com') videoURL = parsedVideo.href;
            const parsedThumbnail = new URL(item.thumbnailURL);
            if (parsedThumbnail.protocol === 'https:' && parsedThumbnail.hostname === 'cdn.pixabay.com') thumbnailURL = parsedThumbnail.href;
          } catch {}
          if (!page || !videoURL) return;
          const figure = document.createElement('figure');
          figure.className = 'assistant-video-card';
          const video = document.createElement('video');
          video.className = 'assistant-video';
          video.src = videoURL;
          if (thumbnailURL) video.poster = thumbnailURL;
          video.controls = true;
          video.preload = 'none';
          video.playsInline = true;
          video.setAttribute('aria-label', `${String(item.tags || 'Pixabay video').slice(0, 120)} · Pixabay`);
          const captionLink = document.createElement('a');
          captionLink.href = page;
          captionLink.target = '_blank';
          captionLink.rel = 'noopener noreferrer';
          captionLink.textContent = `${String(item.tags || 'Stock video').slice(0, 80)} · Pixabay${item.duration ? ` · ${item.duration}s` : ''}`;
          figure.append(video, captionLink);
          grid.append(figure);
        });
        if (grid.childElementCount) section.append(grid);
      }
      if (Array.isArray(result.sources) && result.sources.length) {
        const sourceList = document.createElement('p');
        sourceList.className = 'assistant-sources';
        const label = document.createElement('span');
        label.textContent = 'Links checked: ';
        sourceList.append(label);
        result.sources.slice(0, 3).forEach((source, index) => {
          const href = safeLink(source.url);
          if (!href) return;
          if (index) sourceList.append(document.createTextNode(' · '));
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = new URL(href).hostname;
          sourceList.append(link);
        });
        section.append(sourceList);
      }
      card.append(section);
    }

    const footer = document.createElement('div');
    footer.className = 'task-card-meta';
    const date = document.createElement('span');
    date.textContent = formatDate(task.createdAt);
    const actions = document.createElement('div');
    actions.className = 'task-card-actions';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'task-action';
    toggle.dataset.taskAction = done ? 'reopen' : 'complete';
    toggle.dataset.taskId = task.id;
    toggle.textContent = done ? 'Reopen' : 'Mark done';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-action delete';
    remove.dataset.taskAction = 'delete';
    remove.dataset.taskId = task.id;
    remove.textContent = 'Delete';
    actions.append(toggle, remove);
    footer.append(date, actions);
    card.append(footer);
    return card;
  }

  function renderTasks() {
    const inProgressList = document.getElementById('in-progress-list');
    const completedList = document.getElementById('completed-list');
    if (!inProgressList || !completedList) return;
    const tasks = parseTasks().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const active = tasks.filter(task => task.status === 'in-progress');
    const done = tasks.filter(task => task.status === 'done');
    const fill = (container, rows, completed) => {
      container.replaceChildren();
      if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = completed ? 'Completed items will appear here.' : 'Nothing in progress yet. Add a task from Home.';
        container.append(empty);
        return;
      }
      rows.forEach(task => container.append(taskCard(task, completed)));
    };
    fill(inProgressList, active, false);
    fill(completedList, done, true);
    const activeCount = document.getElementById('in-progress-count');
    const doneCount = document.getElementById('completed-count');
    if (activeCount) activeCount.textContent = String(active.length);
    if (doneCount) doneCount.textContent = String(done.length);
  }

  async function authenticate(create) {
    const email = prompt('Email address for your Frameforge account:');
    if (!email) return;
    const password = prompt(create ? 'Create a password (at least 6 characters):' : 'Your password:');
    if (!password) return;
    try {
      if (!window.FrameforgeFirebase) throw new Error('Firebase is still loading. Try again in a moment.');
      await (create ? window.FrameforgeFirebase.signUp(email.trim(), password) : window.FrameforgeFirebase.signIn(email.trim(), password));
    } catch (error) { alert(`Firebase sign-in failed: ${error.message || error.code || 'Try again.'}`); }
  }
  document.getElementById('login-button')?.addEventListener('click', () => authenticate(false));
  document.getElementById('signup-button')?.addEventListener('click', () => authenticate(true));
  document.getElementById('logout-button')?.addEventListener('click', async () => {
    try { if (window.FrameforgeFirebase?.user) await window.FrameforgeFirebase.signOut(); } catch (error) { alert(`Sign out failed: ${error.message}`); }
    cloudTasks = null; localStorage.setItem(LOGIN_KEY, 'false'); renderSession(); renderTasks();
  });
  window.addEventListener('frameforge-auth-state', event => {
    if (!event.detail) cloudTasks = null;
    const status = document.getElementById('cloud-sync-status');
    if (status) status.textContent = event.detail ? `Signed in as ${event.detail.email || 'your account'}; loading account tasks…` : 'Not signed in. Showing tasks saved locally; sign in from Home to sync.';
    renderSession(); renderTasks();
  });
  window.addEventListener('frameforge-cloud-tasks', event => { cloudTasks = Array.isArray(event.detail) ? event.detail : null; renderTasks(); });
  window.addEventListener('frameforge-cloud-error', event => { console.error('Firestore task sync failed:', event.detail); const feedback = document.getElementById('cloud-sync-status') || document.getElementById('story-help'); if (feedback) feedback.textContent = `Cloud sync unavailable: ${event.detail?.message || 'check Firestore setup and rules'}. Local tasks remain available.`; });
  document.getElementById('settings-button')?.addEventListener('click', event => {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.getElementById('save-settings')?.addEventListener('click', () => {
    const name = document.getElementById('username-setting')?.value.trim();
    if (name) localStorage.setItem(USER_KEY, name.slice(0, 30));
    renderSession();
    const panel = document.getElementById('settings-panel');
    if (panel) panel.hidden = true;
    document.getElementById('settings-button')?.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('generate-story')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const input = document.getElementById('story-command');
    const status = document.getElementById('story-status');
    const results = document.getElementById('story-results');
    const idea = input?.value.trim() || '';
    if (!idea) {
      if (status) status.textContent = 'Enter a story idea before generating drafts.';
      input?.focus();
      return;
    }
    if (idea.length > 2000) {
      if (status) status.textContent = 'Story ideas can be up to 2,000 characters. Shorten the idea and try again.';
      input?.focus();
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'The AI is writing three different story drafts…';
    if (results) { results.hidden = true; results.replaceChildren(); }
    try {
      await window.FrameforgeFirebase?.ready;
      if (!window.FrameforgeFirebase?.user) throw new Error('Sign in first to generate story drafts.');
      const token = await window.FrameforgeFirebase.getIdToken();
      const response = await fetch('/api/story/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ idea }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Story generation failed. Try again.');
      if (!Array.isArray(payload.stories) || payload.stories.length !== 3) throw new Error('The AI returned an incomplete set of story drafts. Try again.');
      payload.stories.forEach((draft, index) => {
        if (typeof draft?.title !== 'string' || typeof draft?.story !== 'string') return;
        const card = document.createElement('article');
        card.className = 'story-draft';
        const kicker = document.createElement('span');
        kicker.className = 'eyebrow';
        kicker.textContent = `Draft 0${index + 1}`;
        const title = document.createElement('h3');
        title.textContent = draft.title;
        const text = document.createElement('p');
        text.className = 'story-draft-text';
        text.textContent = draft.story;
        const useDraft = document.createElement('button');
        useDraft.type = 'button';
        useDraft.className = 'use-story-button';
        useDraft.textContent = 'Use this draft';
        useDraft.addEventListener('click', () => {
          if (input) input.value = draft.story;
          input?.focus();
          if (status) status.textContent = 'Draft copied to the composer for review. It has not been sent or saved.';
        });
        card.append(kicker, title, text, useDraft);
        results?.append(card);
      });
      if (!results || results.childElementCount !== 3) throw new Error('The AI returned an incomplete set of story drafts. Try again.');
      results.hidden = false;
      if (status) status.textContent = 'Three story drafts are ready. Choose one to place it in the composer; nothing has been sent.';
    } catch (error) {
      if (status) status.textContent = error.message || 'Story generation failed. Your idea is still in the composer.';
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });

  document.getElementById('story-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('story-command');
    const text = input?.value.trim() || '';
    const files = window.FrameforgeComposer?.getPendingFiles() || [];
    const feedback = document.getElementById('story-help');
    if (!text && !files.length) {
      if (feedback) feedback.textContent = 'Add task details or attach a file before sending.';
      input?.focus();
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.setAttribute('aria-label', 'Sending task'); button.title = 'Sending task'; }
    const id = crypto.randomUUID?.() || `task-${Date.now()}`;
    const task = {
      id,
      text: text || `Review ${files.length} attached file${files.length === 1 ? '' : 's'}`,
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    };
    try {
      task.attachments = await saveAttachments(id, files);
      const tasks = parseTasks();
      tasks.push(task);
      saveTasks(tasks);
      if (window.FrameforgeFirebase?.user) await window.FrameforgeFirebase.saveTask(task).catch(error => { cloudTasks = null; if (feedback) feedback.textContent = `Saved locally, but cloud sync failed: ${error.message}. Check Firestore setup and rules.`; });
      window.FrameforgeComposer?.clear();
      if (text) {
        if (feedback) feedback.textContent = 'Task saved. The assistant is working on it…';
        try {
          await window.FrameforgeFirebase?.ready;
          if (!window.FrameforgeFirebase?.user) throw new Error('Sign in to have the assistant process this task. The task is saved locally.');
          const token = await window.FrameforgeFirebase.getIdToken();
          const response = await fetch('/api/ai/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'The assistant could not process this task.');
          task.assistantResult = result;
          saveTasks(tasks);
          if (window.FrameforgeFirebase?.user) await window.FrameforgeFirebase.saveTask(task).catch(error => {
            cloudTasks = null;
            if (feedback) feedback.textContent = `Assistant finished, but its response could not sync: ${error.message}. It remains saved on this device.`;
          });
        } catch (error) {
          task.assistantResult = { text: error.message || 'The assistant could not process this task. The task remains saved.' };
          saveTasks(tasks);
        }
      }
      location.href = 'tasks.html';
    } catch {
      if (feedback) feedback.textContent = 'This task could not be saved. Check browser storage and try again.';
      if (button) { button.disabled = false; button.setAttribute('aria-label', 'Send task'); button.title = 'Send task'; }
    }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-task-action]');
    if (!button) return;
    const { taskId, taskAction } = button.dataset;
    const tasks = parseTasks();
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;
    if (taskAction === 'complete') task.status = 'done';
    else if (taskAction === 'reopen') task.status = 'in-progress';
    else if (taskAction === 'delete') {
      try { await deleteAttachments(task.attachments?.map(file => file.id)); } catch {}
      saveTasks(tasks.filter(item => item.id !== taskId));
      if (window.FrameforgeFirebase?.user) await window.FrameforgeFirebase.deleteTask(taskId).catch(error => { cloudTasks = null; console.error('Firestore delete failed:', error); const feedback = document.getElementById('cloud-sync-status') || document.getElementById('story-help'); if (feedback) feedback.textContent = `Deleted locally, but cloud deletion failed: ${error.message}. The task may return after sync resumes.`; });
      renderTasks();
      return;
    }
    saveTasks(tasks);
    if (window.FrameforgeFirebase?.user) await window.FrameforgeFirebase.updateTask(task).catch(error => { cloudTasks = null; console.error('Firestore update failed:', error); const feedback = document.getElementById('cloud-sync-status') || document.getElementById('story-help'); if (feedback) feedback.textContent = `Updated locally, but cloud sync failed: ${error.message}. Check Firestore setup and rules.`; });
    renderTasks();
  });

  migrateLegacyProjects();
  renderSession();
  renderTasks();
})();

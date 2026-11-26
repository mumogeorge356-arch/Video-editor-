(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('preview-canvas');
  const ctx = canvas.getContext('2d');
  const video = $('source-video');
  const audio = $('source-audio');
  const STORE = 'frameforge.editor.v1';
  const DEFAULT_PROJECT = { brightness: 100, contrast: 100, saturation: 100, hue: 0, filter: 'none', mute: false, volume: 100, shadow: false };
  const state = {
    layers: [], selected: null, videoUrl: null, audioUrl: null, stillUrl: null,
    duration: 0, time: 0, trimStart: 0, trimEnd: 0, playing: false,
    frames: [], project: { ...DEFAULT_PROJECT },
  };
  const objectUrls = new Set();
  let animationId = 0;
  let cloudSaveTimer = 0;
  const newId = () => crypto.randomUUID?.() || `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const say = message => { $('editor-status').textContent = message; };
  const timeText = time => { const n = Math.max(0, Number(time) || 0); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}.${Math.floor((n % 1) * 10)}`; };
  function saveProject() {
    const safe = state.layers.map(({ image, videoEl, imageUrl, ...layer }) => layer);
    const projectData = { layers: safe, project: state.project, frames: state.frames, trimStart: state.trimStart, trimEnd: state.trimEnd };
    try { localStorage.setItem(STORE, JSON.stringify(projectData)); } catch { /* storage is optional */ }
    if (window.FrameforgeFirebase?.user) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => window.FrameforgeFirebase.saveEditorProject(projectData).catch(error => say(`Cloud settings sync failed: ${error.message}. Local settings are still saved.`)), 700);
    }
  }
  function loadProject() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (Array.isArray(saved.layers)) state.layers = saved.layers.filter(layer => layer && typeof layer.id === 'string' && typeof layer.type === 'string').map(layer => ({ ...layer, image: null }));
      if (saved.project && typeof saved.project === 'object') state.project = { ...state.project, ...saved.project };
      if (Array.isArray(saved.frames)) state.frames = saved.frames.filter(frame => Number.isFinite(frame.time));
    } catch { /* ignore invalid local project data */ }
  }
  function reloadLocalProject() {
    state.layers = []; state.frames = []; state.trimStart = 0; state.trimEnd = 0; state.project = { ...DEFAULT_PROJECT };
    loadProject();
    renderLayers(); renderTimeline(); updateInspector(); draw();
  }
  window.addEventListener('frameforge-editor-project', event => {
    const saved = event.detail;
    if (!saved || typeof saved !== 'object') { reloadLocalProject(); return; }
    if (Array.isArray(saved.layers)) state.layers = saved.layers.filter(layer => layer && typeof layer.id === 'string' && typeof layer.type === 'string').map(layer => ({ ...layer, image: null, videoEl: null, imageUrl: null }));
    if (saved.project && typeof saved.project === 'object') state.project = { ...state.project, ...saved.project };
    if (Array.isArray(saved.frames)) state.frames = saved.frames.filter(frame => Number.isFinite(frame.time));
    state.trimStart = Number(saved.trimStart) || 0; state.trimEnd = Number(saved.trimEnd) || 0;
    renderLayers(); renderTimeline(); updateInspector(); draw();
    say('Cloud project settings loaded. Reselect source media to preview or render.');
  });
  const selectedLayer = () => state.layers.find(layer => layer.id === state.selected);
  function addLayer(layer) {
    const row = { id: newId(), visible: true, locked: false, opacity: 100, blend: 'source-over', mask: 'none', group: '', x: 50, y: layer.type==='video-overlay'?50:78, endX: 50, endY: layer.type==='video-overlay'?50:78, endOpacity: 100, keyframes: [], ...layer };
    state.layers.push(row); state.selected = row.id; saveProject(); renderLayers(); renderTimeline(); updateInspector(); draw(); return row;
  }
  const fileType = file => file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'other';
  function setVideo(file) {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file); objectUrls.add(state.videoUrl);
    video.pause(); video.src = state.videoUrl; video.load();
    video.addEventListener('loadedmetadata', () => {
      state.duration = Number.isFinite(video.duration) ? video.duration : 0;
      state.trimStart = 0; state.trimEnd = state.duration; state.time = 0;
      if (!state.layers.some(layer => layer.type === 'video')) addLayer({ type: 'video', name: file.name, fileName: file.name });
      else { const base = state.layers.find(layer => layer.type === 'video'); base.name = file.name; base.fileName = file.name; renderLayers(); saveProject(); }
      $('preview-empty').hidden = true; $('preview-state').textContent = 'Video ready'; $('preview-resolution').textContent = `${video.videoWidth} × ${video.videoHeight}`;
      $('audio-state').textContent = video.audioTracks?.length ? 'Source audio available' : 'Video audio track (if present)';
      enableMediaTools(); updateTimeline(); draw(); say(`Loaded ${file.name}. Use the playhead and trim controls to shape this clip.`);
    }, { once: true });
    video.addEventListener('error', () => say('This video could not be decoded by the browser. Try a common MP4/H.264 or WebM file.'), { once: true });
  }
  function setAudio(file) {
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(file); objectUrls.add(state.audioUrl);
    audio.src = state.audioUrl; audio.load(); $('audio-state').textContent = file.name; say(`Audio track added: ${file.name}. Independent audio mixing is available for preview; WebM capture may depend on browser support.`);
  }
  function addVideoOverlay(file) {
    const url = URL.createObjectURL(file); objectUrls.add(url);
    const videoEl = document.createElement('video'); videoEl.src = url; videoEl.preload = 'auto'; videoEl.playsInline = true; videoEl.muted = true;
    videoEl.addEventListener('loadedmetadata', () => { addLayer({ type: 'video-overlay', name: file.name, fileName: file.name, videoEl }); say(`Video layer “${file.name}” added above the primary clip.`); }, { once: true });
    videoEl.addEventListener('error', () => say(`Could not decode video layer ${file.name}.`), { once: true }); videoEl.load();
  }
  function importFiles(files) {
    [...files].forEach(file => {
      const type = fileType(file);
      if (type === 'video') { if (state.videoUrl) addVideoOverlay(file); else setVideo(file); }
      else if (type === 'image') {
        const url = URL.createObjectURL(file); objectUrls.add(url);
        const image = new Image(); image.onload = () => { addLayer({ type: 'image', name: file.name, fileName: file.name, image, imageUrl: url }); enableMediaTools(); draw(); };
        image.onerror = () => say(`Could not open image ${file.name}.`); image.src = url;
      } else if (type === 'audio') { setAudio(file); if (!state.layers.some(layer => layer.type === 'audio')) addLayer({ type: 'audio', name: file.name, fileName: file.name }); }
      else say(`Skipped unsupported file: ${file.name}`);
    });
  }
  function enableMediaTools() {
    const hasVideo = Boolean(state.videoUrl && state.duration);
    ['play-toggle','scrubber','add-frame','trim-start','trim-end','export-video','export-gif'].forEach(id => { $(id).disabled = !hasVideo; });
    const layer=selectedLayer();$('add-keyframe').disabled=!hasVideo||!layer||layer.locked||!['text','image','video-overlay'].includes(layer.type);
    $('layer-opacity').disabled = !selectedLayer() || Boolean(selectedLayer()?.locked); $('layer-blend').disabled = !selectedLayer() || Boolean(selectedLayer()?.locked); $('layer-mask').disabled = !selectedLayer() || Boolean(selectedLayer()?.locked);
    renderTimeline();
  }
  function renderLayers() {
    const box = $('layer-list'); box.replaceChildren();
    if (!state.layers.length) { const empty = document.createElement('div'); empty.className = 'editor-empty'; empty.textContent = 'Your layers will appear here.'; box.append(empty); }
    state.layers.slice().reverse().forEach(layer => {
      const row = document.createElement('div'); row.className = `layer-row${state.selected === layer.id ? ' selected' : ''}${!layer.visible ? ' layer-hidden' : ''}`; row.dataset.layerId = layer.id;
      const select = document.createElement('button'); select.type = 'button'; select.className = 'layer-select'; select.dataset.selectLayer = layer.id;
      const icon = document.createElement('span'); icon.className = 'layer-type-icon'; icon.textContent = ({ video: '▶', 'video-overlay': '▶', image: '▧', text: 'T', adjustment: '◐', audio: '♫' })[layer.type] || '◇';
      const details = document.createElement('span'); details.className = 'layer-copy'; const title = document.createElement('b'); title.textContent = layer.name || layer.type; const subtitle = document.createElement('small'); subtitle.textContent = `${layer.group ? `${layer.group} · ` : ''}${layer.type}`; details.append(title, subtitle); select.append(icon, details);
      const actions = document.createElement('span'); actions.className = 'layer-row-actions';
      const visibility = document.createElement('button'); visibility.type = 'button'; visibility.dataset.layerToggle = 'visible'; visibility.dataset.layerId = layer.id; visibility.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`); visibility.textContent = layer.visible ? '◉' : '○';
      const lock = document.createElement('button'); lock.type = 'button'; lock.dataset.layerToggle = 'locked'; lock.dataset.layerId = layer.id; lock.setAttribute('aria-label', `${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`); lock.textContent = layer.locked ? '▣' : '⌑'; actions.append(visibility, lock);
      const up = document.createElement('button'); up.type='button'; up.dataset.layerMove='up'; up.dataset.layerId=layer.id; up.setAttribute('aria-label',`Move ${layer.name} up`); up.textContent='↑';
      const down = document.createElement('button'); down.type='button'; down.dataset.layerMove='down'; down.dataset.layerId=layer.id; down.setAttribute('aria-label',`Move ${layer.name} down`); down.textContent='↓';
      const remove = document.createElement('button'); remove.type='button'; remove.dataset.layerRemove=layer.id; remove.disabled=Boolean(layer.locked); remove.title=layer.locked?'Unlock this layer to remove it':''; remove.setAttribute('aria-label',`Remove ${layer.name}`); remove.textContent='×';
      actions.append(up,down,remove); row.append(select,actions); box.append(row);
    });
    $('layer-count').textContent = String(state.layers.length);
  }
  function updateInspector() {
    const layer = selectedLayer(); const controls = ['layer-name','layer-opacity','layer-blend','layer-mask'];
    controls.forEach(id => { $(id).disabled = !layer || Boolean(layer.locked); });
    const motionControls = ['motion-x','motion-y','motion-end-x','motion-end-y','motion-opacity']; motionControls.forEach(id => { $(id).disabled = !layer || Boolean(layer.locked) || !['text','image','video-overlay'].includes(layer.type); }); $('layer-shadow').disabled=!layer||Boolean(layer.locked)||layer.type!=='text';
    $('layer-name').value = layer?.name || ''; $('layer-kind').textContent = layer?.type || 'None';
    $('layer-opacity').value = String(layer?.opacity ?? 100); $('opacity-value').value = `${layer?.opacity ?? 100}%`; $('layer-blend').value = layer?.blend || 'source-over'; $('layer-mask').value = layer?.mask || 'none';
    $('motion-x').value = String(layer?.x ?? 50); $('motion-y').value = String(layer?.y ?? 78); $('motion-end-x').value = String(layer?.endX ?? 50); $('motion-end-y').value = String(layer?.endY ?? 78); $('motion-opacity').value = String(layer?.endOpacity ?? 100); $('motion-opacity-value').value = `${layer?.endOpacity ?? 100}%`; $('layer-shadow').checked = Boolean(state.project.shadow);
    $('keyframe-readout').textContent = String(layer?.keyframes?.length || 0); $('keyframe-dots').innerHTML = `<span class="dot-active"></span><span></span>${(layer?.keyframes || []).map(() => '<i></i>').join('')}`;
    enableMediaTools();
  }
  function interpolate(layer, prop, fallback, time) {
    const frames = (layer.keyframes || []).filter(frame => Number.isFinite(frame.time)).slice().sort((a,b) => a.time-b.time);
    if (!frames.length) {
      const start = prop === 'opacity' ? Number(layer.startOpacity ?? 100) : Number(layer[prop] ?? fallback); const endProp = prop === 'x' ? 'endX' : prop === 'y' ? 'endY' : 'endOpacity';
      const end = Number(layer[endProp] ?? start); const ratio = state.duration ? clamp((time - state.trimStart) / Math.max(.01, state.trimEnd - state.trimStart), 0, 1) : 0;
      return start + (end-start)*ratio;
    }
    const key = prop === 'opacity' ? 'opacity' : prop;
    if (time <= frames[0].time) return Number(frames[0][key] ?? fallback);
    for (let i=1;i<frames.length;i++) if (time <= frames[i].time) { const a=frames[i-1],b=frames[i],r=(time-a.time)/Math.max(.001,b.time-a.time); return Number(a[key]??fallback)+(Number(b[key]??fallback)-Number(a[key]??fallback))*r; }
    return Number(frames[frames.length-1][key] ?? fallback);
  }
  function filterString() {
    const presets = { none:'', mono:'grayscale(1)', warm:'sepia(.35) saturate(1.25)', cool:'hue-rotate(185deg) saturate(.88)', vintage:'sepia(.22) contrast(1.08) saturate(.82)', sepia:'sepia(1)' };
    return `brightness(${state.project.brightness}%) contrast(${state.project.contrast}%) saturate(${state.project.saturation}%) hue-rotate(${state.project.hue}deg) ${presets[state.project.filter] || ''}`;
  }
  function roundedPath(x,y,w,h,r) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
  function drawOverlay(layer) {
    if (!layer.visible) return;
    const xPct = interpolate(layer, 'x', 50, state.time), yPct = interpolate(layer, 'y', 78, state.time);
    const animatedOpacity = interpolate(layer, 'opacity', 100, state.time);
    ctx.save(); ctx.globalAlpha = clamp(layer.opacity * animatedOpacity / 10000, 0, 1); ctx.globalCompositeOperation = layer.blend || 'source-over'; ctx.filter = state.layers.some(item=>item.type==='adjustment'&&item.visible) ? filterString() : 'none';
    if (layer.type === 'adjustment') { ctx.restore(); return; }
    let width, height;
    if (layer.type === 'video-overlay' && layer.videoEl?.readyState >= 2) {
      if (state.videoUrl && Math.abs(layer.videoEl.currentTime - state.time) > .18 && !layer.videoEl.seeking) layer.videoEl.currentTime = Math.min(state.time, Math.max(0, layer.videoEl.duration - .05));
      const source = layer.videoEl, scale = Math.min(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
      width = source.videoWidth * scale; height = source.videoHeight * scale;
    }
    else if (layer.type === 'image' && layer.image?.complete) { const scale = Math.min(1, 520 / layer.image.width, 310 / layer.image.height); width = layer.image.width * scale; height = layer.image.height * scale; }
    else if (layer.type === 'text') { ctx.font = '700 62px "Space Grotesk", sans-serif'; width = Math.min(920, Math.max(300, ctx.measureText(layer.text || '').width + 70)); height = 100; }
    else { ctx.restore(); return; }
    const x = canvas.width * xPct / 100 - width / 2, y = canvas.height * yPct / 100 - height / 2;
    if (layer.mask === 'clip-video' && state.videoUrl && video.videoWidth && video.videoHeight) {
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const baseWidth = video.videoWidth * scale, baseHeight = video.videoHeight * scale;
      ctx.beginPath(); ctx.rect((canvas.width - baseWidth) / 2, (canvas.height - baseHeight) / 2, baseWidth, baseHeight); ctx.clip();
    } else if (layer.mask === 'circle') { ctx.beginPath(); ctx.ellipse(x+width/2,y+height/2,width/2,height/2,0,0,Math.PI*2); ctx.clip(); }
    else if (layer.mask === 'rounded') { roundedPath(x,y,width,height,24); ctx.clip(); }
    if (layer.type === 'video-overlay' && layer.videoEl?.readyState >= 2) ctx.drawImage(layer.videoEl,x,y,width,height);
    else if (layer.type === 'image') ctx.drawImage(layer.image,x,y,width,height);
    else {
      if (state.project.shadow) { ctx.shadowColor = '#000c'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5; }
      ctx.fillStyle = layer.color || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = String(layer.text || 'Your title').split('\n').slice(0,3); lines.forEach((line,index) => ctx.fillText(line,canvas.width*xPct/100,canvas.height*yPct/100+(index-(lines.length-1)/2)*72,900));
    }
    ctx.restore();
  }
  function draw() {
    ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle = '#09090d'; ctx.fillRect(0,0,canvas.width,canvas.height); const adjustmentActive=state.layers.some(layer=>layer.type==='adjustment'&&layer.visible); ctx.filter = adjustmentActive ? filterString() : 'none';
    const videoLayer = state.layers.find(layer => layer.type === 'video');
    if (state.videoUrl && video.readyState >= 2 && videoLayer && videoLayer.visible !== false) {
      const scale = Math.min(canvas.width/video.videoWidth,canvas.height/video.videoHeight); const w=video.videoWidth*scale,h=video.videoHeight*scale;
      ctx.save();ctx.globalAlpha=(videoLayer.opacity??100)/100;ctx.globalCompositeOperation=videoLayer.blend||'source-over';if(videoLayer.mask==='circle'){ctx.beginPath();ctx.ellipse(canvas.width/2,canvas.height/2,Math.min(w,h)/2,Math.min(w,h)/2,0,0,Math.PI*2);ctx.clip();}else if(videoLayer.mask==='rounded'){roundedPath((canvas.width-w)/2,(canvas.height-h)/2,w,h,24);ctx.clip();}ctx.drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);ctx.restore();
    } else if (state.stillUrl) { const imageLayer=state.layers.find(layer=>layer.type==='image'&&layer.image); if(imageLayer) { const scale=Math.max(canvas.width/imageLayer.image.width,canvas.height/imageLayer.image.height);const w=imageLayer.image.width*scale,h=imageLayer.image.height*scale;ctx.drawImage(imageLayer.image,(canvas.width-w)/2,(canvas.height-h)/2,w,h); } }
    state.layers.filter(layer=>['image','text','video-overlay'].includes(layer.type)).forEach(drawOverlay); ctx.restore();
    if (state.duration) { $('current-time').textContent=timeText(state.time); $('scrubber').value=String(Math.round(state.time*10));const left=`${100*state.time/Math.max(.1,state.duration)}%`;document.querySelectorAll('.timeline-playhead').forEach(playhead=>playhead.style.left=left); }
  }
  function updateTimeline() {
    $('duration-readout').textContent=timeText(state.duration); $('trim-readout').textContent=`${timeText(state.trimStart)} — ${timeText(state.trimEnd)}`;
    const scrub=$('scrubber'); scrub.max=String(Math.max(1,Math.round(state.duration*10))); scrub.value=String(Math.round(state.time*10));
    const tracks=$('timeline-tracks'); tracks.replaceChildren();
    const lane=(label,type,target=null)=>{ const name=document.createElement('div');name.className='timeline-track-label';name.textContent=label;const area=document.createElement('div');area.className='track-lane';const clip=target||state.layers.find(layer=>layer.type===type);if(clip){const bar=document.createElement('div');bar.className=`timeline-clip ${type==='video-overlay'?'video':type}-clip`;bar.style.marginLeft=`${100*state.trimStart/Math.max(.1,state.duration)}%`;bar.style.width=`${Math.max(3,100*(state.trimEnd-state.trimStart)/Math.max(.1,state.duration))}%`;bar.textContent=clip.name;area.append(bar);const markers=clip.keyframes||((type==='video')?state.frames:[]);markers.forEach(frame=>{const marker=document.createElement('span');marker.className='keyframe-marker';marker.style.left=`${100*frame.time/Math.max(.1,state.duration)}%`;marker.title=`Keyframe ${timeText(frame.time)}`;area.append(marker);});const playhead=document.createElement('span');playhead.className='timeline-playhead';playhead.style.left=`${100*state.time/Math.max(.1,state.duration)}%`;area.append(playhead);}else {const placeholder=document.createElement('div');placeholder.className='timeline-placeholder';placeholder.textContent=type==='video'?'Import a video to create a clip':'Add an image, text or audio layer';area.append(placeholder);}tracks.append(name,area);};
    lane('Video','video'); state.layers.filter(layer=>layer.type==='video-overlay').forEach(layer=>lane(layer.name,'video-overlay',layer)); state.layers.filter(layer=>['image','text'].includes(layer.type)).forEach(layer=>lane(layer.name,layer.type,layer)); if(state.audioUrl||state.layers.some(layer=>layer.type==='audio'))lane('Audio','audio',state.layers.find(layer=>layer.type==='audio'));
    $('frame-readout').textContent=String(state.frames.length); renderLayers();
  }
  function tick() {
    if (!state.playing) return;
    state.time = video.currentTime || state.time;
    if (state.time >= state.trimEnd || video.error || video.paused) { video.pause(); audio.pause(); state.playing=false; $('play-toggle').textContent='▶'; $('play-toggle').setAttribute('aria-label','Play'); return; }
    draw(); animationId=requestAnimationFrame(tick);
  }
  async function play() {
    if (!state.videoUrl) return;
    if (state.playing) { video.pause(); audio.pause(); state.playing=false; cancelAnimationFrame(animationId); $('play-toggle').textContent='▶'; $('play-toggle').setAttribute('aria-label','Play'); return; }
    if (video.currentTime < state.trimStart || video.currentTime >= state.trimEnd) video.currentTime=state.trimStart;
    try { video.muted=Boolean(state.project.mute); video.volume=state.project.volume/100; await video.play(); if(state.audioUrl){audio.currentTime=Math.max(0,state.time);audio.volume=state.project.volume/100;audio.muted=Boolean(state.project.mute);audio.play().catch(()=>{});} state.playing=true; $('play-toggle').textContent='Ⅱ'; $('play-toggle').setAttribute('aria-label','Pause'); tick(); }
    catch { say('Playback was blocked or the selected media is not ready. Press Play again after the file loads.'); }
  }
  function addKeyframe() {
    const layer=selectedLayer(); if(!layer||layer.locked||!['text','image','video-overlay'].includes(layer.type)) return;
    upsertLayerKeyframe(layer,state.time,{x:interpolate(layer,'x',50,state.time),y:interpolate(layer,'y',78,state.time),opacity:interpolate(layer,'opacity',100,state.time)}); saveProject(); updateInspector(); updateTimeline(); draw(); say(`Keyframe added at ${timeText(state.time)} for ${layer.name}.`);
  }
  function upsertLayerKeyframe(layer,time,pose) { layer.keyframes ||= []; const existing=layer.keyframes.find(frame=>Math.abs(frame.time-time)<.025); if(existing)Object.assign(existing,pose,{time});else layer.keyframes.push({time,...pose});layer.keyframes.sort((a,b)=>a.time-b.time); }
  function addFrame() {
    if (!state.videoUrl) return;
    const layer=selectedLayer(); if(layer?.locked)return say('Unlock the selected layer before adding an animation frame.'); const frame={time:state.time,layerId:layer?.id||null,x:layer?interpolate(layer,'x',50,state.time):50,y:layer?interpolate(layer,'y',78,state.time):78,opacity:layer?interpolate(layer,'opacity',layer.opacity,state.time):100}; state.frames.push(frame); state.frames.sort((a,b)=>a.time-b.time);
    if(layer&&['text','image','video-overlay'].includes(layer.type)) upsertLayerKeyframe(layer,state.time,{x:frame.x,y:frame.y,opacity:frame.opacity});
    saveProject(); updateInspector(); updateTimeline(); say(`Animation frame ${state.frames.length} saved at ${timeText(state.time)}.`);
  }
  function addLayerGroup() {
    const layer=selectedLayer(); if(!layer)return say('Select a layer first.'); const siblings=state.layers.filter(item=>item.id!==layer.id&&['image','text'].includes(item.type));
    if(!siblings.length)return say('Add at least one more text or image layer to create a layer group.');
    const group=window.prompt('Name this layer group:',layer.group||'Scene group'); if(!group?.trim())return;
    layer.group=group.trim().slice(0,40); siblings.forEach(item=>{item.group=group.trim().slice(0,40);}); saveProject(); renderLayers(); say(`Grouped ${siblings.length+1} overlay layers as “${group.trim()}”.`);
  }
  function addText() {
    const text=window.prompt('Text for this layer:', 'Your title'); if(text===null)return;
    const layer=addLayer({type:'text',name:text.trim().slice(0,40)||'Text layer',text:text.trim()||'Your title',color:'#ffffff'}); updateInspector(); say(`Text layer “${layer.name}” added. Use Motion to animate its position and opacity.`);
  }
  function addAdjustment() { if(!state.layers.some(layer=>layer.type==='adjustment')) addLayer({type:'adjustment',name:'Colour adjustment'}); else say('An adjustment layer is already active. Use the Colour panel to grade the full composition.'); updateInspector(); }
  function ensureAdjustmentLayer() { if(state.layers.some(layer=>layer.type==='adjustment'))return; state.layers.push({id:newId(),type:'adjustment',name:'Colour adjustment',visible:true,locked:false,opacity:100,blend:'source-over',mask:'none',group:'',keyframes:[]});saveProject();renderLayers(); }
  function exportBlob(blob,name) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
  function seekVideo(time) {
    const target = clamp(time, 0, Math.max(0, video.duration || state.duration));
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < .015) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error('Timed out while seeking the video.')); }, 8000);
      const onSeeked = () => { clearTimeout(timer); resolve(); };
      video.addEventListener('seeked', onSeeked, { once: true }); video.currentTime = target;
    });
  }
  async function exportVideo() {
    if(!state.videoUrl||!window.MediaRecorder)return say('This browser does not support MediaRecorder video export.');
    const canvasStream=canvas.captureStream(30);const capture=video.captureStream?.()||video.mozCaptureStream?.(); if(capture){capture.getAudioTracks().forEach(track=>canvasStream.addTrack(track));}
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime){canvasStream.getTracks().forEach(track=>track.stop());return say('This browser does not report a supported WebM encoder. Try current Chrome, Edge or Firefox.');}
    const button=$('export-video');button.disabled=true;button.textContent='Rendering…'; say('Rendering video in this browser. Keep this tab open until the download begins.');
    const chunks=[];let recorder;let finished;
    try {
      video.pause();audio.pause();state.playing=false;await seekVideo(state.trimStart);video.muted=state.project.mute;video.volume=state.project.volume/100;
      if (state.audioUrl && (audio.captureStream?.() || audio.mozCaptureStream?.())) {
        audio.currentTime = Math.max(0, state.trimStart); audio.muted = state.project.mute; audio.volume = state.project.volume / 100;
        const audioCapture = audio.captureStream?.() || audio.mozCaptureStream?.(); audioCapture.getAudioTracks().forEach(track => canvasStream.addTrack(track));
      }
      recorder=new MediaRecorder(canvasStream,{mimeType:mime}); recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(recorder.error||new Error('MediaRecorder failed'));});
      recorder.start(250);await video.play();if(state.audioUrl)audio.play().catch(()=>{});
      await new Promise((resolve,reject)=>{const deadline=Date.now()+Math.max(30000,(state.trimEnd-state.trimStart)*3000),stalledLimit=8000;let lastTime=video.currentTime,lastAdvance=Date.now();const check=()=>{state.time=video.currentTime;draw();if(video.error)return reject(new Error('The video playback failed during rendering.'));if(video.currentTime>=state.trimEnd||video.ended){video.pause();audio.pause();resolve();return;}if(Date.now()>deadline)return reject(new Error('Rendering took too long.'));if(video.currentTime>lastTime+.01){lastTime=video.currentTime;lastAdvance=Date.now();}else if(Date.now()-lastAdvance>stalledLimit)return reject(new Error('Video playback stalled during rendering.'));requestAnimationFrame(check);};check();});
      recorder.stop(); await finished; const blob=new Blob(chunks,{type:mime});if(!blob.size)throw new Error('The browser returned an empty recording.');exportBlob(blob,`frameforge-${Date.now()}.webm`);say('WebM render complete. Source audio is included only when the browser exposes its media stream.');
    } catch(error) { video.pause();audio.pause();if(recorder&&recorder.state!=='inactive'){recorder.stop();await finished?.catch(()=>{});}say(`Video render failed: ${error.message||'media capture was unavailable'}.`); }
    finally {canvasStream.getTracks().forEach(track=>track.stop());button.disabled=false;button.textContent='Render WebM';state.time=state.trimStart;await seekVideo(state.trimStart).catch(()=>{});draw();}
  }
  function wordBytes(text) { return [...text].map(char=>char.charCodeAt(0)); }
  function gifLzw(indices) {
    const clear=256,end=257;let codeSize=9,next=258,max=(1<<codeSize)-1;const map=new Map();const codes=[];
    const reset=()=>{map.clear();codeSize=9;next=258;max=(1<<codeSize)-1;};reset();codes.push(clear);
    if(!indices.length){codes.push(end);return packCodes(codes);}
    let prefix=indices[0];
    for(let i=1;i<indices.length;i++){
      const symbol=indices[i],key=`${prefix},${symbol}`;
      if(map.has(key))prefix=map.get(key);
      else {codes.push(prefix);if(next<4096){map.set(key,next++);if(next>max&&codeSize<12){codeSize++;max=(1<<codeSize)-1;}}else{codes.push(clear);reset();}prefix=symbol;}
    }
    codes.push(prefix,end);return packCodes(codes);
    function packCodes(list){let size=9,available=258,old=-1,bits=0,count=0,out=[];for(const code of list){bits|=code<<count;count+=size;while(count>=8){out.push(bits&255);bits>>>=8;count-=8;}if(code===clear){size=9;available=258;old=-1;continue;}if(old!==-1&&available<4096){available++;if(available===(1<<size)&&size<12)size++;}old=code;}if(count)out.push(bits&255);return out;}
  }
  function encodeGif(frames,width,height,delayCs) {
    const out=[...wordBytes('GIF89a'),width&255,width>>8,height&255,height>>8,0xf7,0,0];
    for(let i=0;i<256;i++)out.push(((i>>5)&7)*255/7|0,((i>>2)&7)*255/7|0,(i&3)*255/3|0);
    out.push(0x21,0xff,11,...wordBytes('NETSCAPE2.0'),3,1,0,0,0);
    frames.forEach(frame=>{
      out.push(0x21,0xf9,4,4,delayCs&255,(delayCs>>8)&255,0,0,0x2c,0,0,0,0,width&255,width>>8,height&255,height>>8,0,8);
      const idx=[];for(let i=0;i<frame.length;i+=4){const r=frame[i],g=frame[i+1],b=frame[i+2];idx.push((r>>5)<<5|(g>>5)<<2|(b>>6));}
      const compressed=gifLzw(idx);for(let i=0;i<compressed.length;i+=255){const part=compressed.slice(i,i+255);out.push(part.length,...part);}out.push(0);
    });out.push(0x3b);return new Blob([new Uint8Array(out)],{type:'image/gif'});
  }
  async function exportGif() {
    if(!state.videoUrl)return say('Load a video before exporting an animated GIF.');
    const start=state.trimStart,end=Math.min(state.trimEnd,start+8);if(end<=start)return say('Set a longer trim range before exporting the GIF.');
    const button=$('export-gif');button.disabled=true;button.textContent='Encoding…';say('Encoding an animated GIF locally (maximum 8 seconds, 320 × 180, 12 fps).');
    const width=320,height=180,frameCanvas=document.createElement('canvas');frameCanvas.width=width;frameCanvas.height=height;const frameCtx=frameCanvas.getContext('2d');const frames=[];const step=1/12;
    try {
      video.pause();for(let time=start;time<end;time+=step){await seekVideo(time);state.time=time;draw();frameCtx.fillStyle='#09090d';frameCtx.fillRect(0,0,width,height);frameCtx.drawImage(canvas,0,0,width,height);frames.push(frameCtx.getImageData(0,0,width,height).data);}
      const blob=encodeGif(frames,width,height,Math.round(100/12));exportBlob(blob,`frameforge-${Date.now()}.gif`);say(`Animated GIF exported (${frames.length} frames at 320 × 180). GIF is silent and colour-reduced to a 256-colour palette.`);
    }catch(error){say(`GIF export failed: ${error.message||'frame encoding was unavailable'}.`);}
    finally{button.disabled=false;button.textContent='Export GIF';state.time=start;await seekVideo(start).catch(()=>{});draw();}
  }
  function setRange(id, prop, suffix='%') { const input=$(id);const value=Number(input.value);state.project[prop]=value;ensureAdjustmentLayer();const output=$(`${id}-value`);if(output)output.value=`${value}${suffix}`;saveProject();draw(); }
  $('add-media').addEventListener('click',()=> $('media-files').click());
  $('media-files').addEventListener('change',event=>{importFiles(event.currentTarget.files);event.currentTarget.value='';});
  $('preview-canvas').addEventListener('dragover',event=>event.preventDefault());$('preview-canvas').addEventListener('drop',event=>{event.preventDefault();importFiles(event.dataTransfer.files);});
  $('add-text').addEventListener('click',addText);$('add-adjustment').addEventListener('click',addAdjustment);$('group-layer').addEventListener('click',addLayerGroup);
  $('layer-list').addEventListener('click',event=>{
    const remove=event.target.closest('[data-layer-remove]');if(remove){const id=remove.dataset.layerRemove;const layer=state.layers.find(item=>item.id===id);if(layer?.locked)return say('Unlock this layer before removing it.');if(layer?.videoEl)layer.videoEl.pause();if(layer?.imageUrl){URL.revokeObjectURL(layer.imageUrl);objectUrls.delete(layer.imageUrl);}if(layer?.videoEl?.src){URL.revokeObjectURL(layer.videoEl.src);objectUrls.delete(layer.videoEl.src);}if(layer?.type==='audio'){audio.pause();if(state.audioUrl){URL.revokeObjectURL(state.audioUrl);objectUrls.delete(state.audioUrl);}state.audioUrl=null;$('audio-state').textContent='No audio detected';}state.layers=state.layers.filter(item=>item.id!==id);if(state.selected===id)state.selected=state.layers.at(-1)?.id||null;saveProject();renderLayers();renderTimeline();updateInspector();draw();return;}
    const move=event.target.closest('[data-layer-move]');if(move){const index=state.layers.findIndex(item=>item.id===move.dataset.layerId);if(state.layers[index]?.locked)return;const next=index+(move.dataset.layerMove==='up'?1:-1);if(index>=0&&next>=0&&next<state.layers.length){[state.layers[index],state.layers[next]]=[state.layers[next],state.layers[index]];saveProject();renderLayers();renderTimeline();draw();}return;}
    const toggle=event.target.closest('[data-layer-toggle]');if(toggle){const layer=state.layers.find(item=>item.id===toggle.dataset.layerId);if(!layer)return;layer[toggle.dataset.layerToggle]=!layer[toggle.dataset.layerToggle];saveProject();renderLayers();draw();return;}
    const select=event.target.closest('[data-select-layer]');if(select){state.selected=select.dataset.selectLayer;renderLayers();updateInspector();draw();}
  });
  $('layer-name').addEventListener('input',event=>{const layer=selectedLayer();if(!layer||layer.locked)return;layer.name=event.target.value.slice(0,60);if(layer.type==='text')layer.text=layer.name;saveProject();renderLayers();draw();});
  $('layer-opacity').addEventListener('input',event=>{const layer=selectedLayer();if(!layer||layer.locked)return;layer.opacity=Number(event.target.value);$('opacity-value').value=`${layer.opacity}%`;saveProject();draw();});
  $('layer-blend').addEventListener('change',event=>{const layer=selectedLayer();if(layer&&!layer.locked){layer.blend=event.target.value;saveProject();draw();}});
  $('layer-mask').addEventListener('change',event=>{const layer=selectedLayer();if(layer&&!layer.locked){layer.mask=event.target.value;saveProject();draw();}});
  [['motion-x','x'],['motion-y','y'],['motion-end-x','endX'],['motion-end-y','endY'],['motion-opacity','endOpacity']].forEach(([id,key])=>$(id).addEventListener('input',event=>{const layer=selectedLayer();if(!layer||layer.locked)return;layer[key]=clamp(event.target.value,0,100);if(layer.keyframes?.length){const prop=key==='endX'?'x':key==='endY'?'y':key==='endOpacity'?'opacity':key;const targetTime=key.startsWith('end')?Math.max(...layer.keyframes.map(frame=>frame.time)):state.time;const pose={x:interpolate(layer,'x',50,targetTime),y:interpolate(layer,'y',78,targetTime),opacity:interpolate(layer,'opacity',100,targetTime)};pose[prop]=layer[key];upsertLayerKeyframe(layer,targetTime,pose);updateInspector();updateTimeline();}if(key==='endOpacity')$('motion-opacity-value').value=`${layer[key]}%`;saveProject();draw();}));
  $('layer-shadow').addEventListener('change',event=>{state.project.shadow=event.target.checked;saveProject();draw();});
  [['brightness','brightness'],['contrast','contrast'],['saturation','saturation']].forEach(([id,key])=>$(id).addEventListener('input',()=>setRange(id,key,'%')));
  $('hue').addEventListener('input',()=>setRange('hue','hue','°'));$('filter-preset').addEventListener('change',event=>{state.project.filter=event.target.value;ensureAdjustmentLayer();saveProject();draw();});
  $('audio-mute').addEventListener('change',event=>{state.project.mute=event.target.checked;video.muted=event.target.checked;audio.muted=event.target.checked;saveProject();});
  $('audio-volume').addEventListener('input',event=>{state.project.volume=Number(event.target.value);$('audio-volume-value').value=`${state.project.volume}%`;video.volume=state.project.volume/100;audio.volume=state.project.volume/100;saveProject();});
  $('play-toggle').addEventListener('click',play);$('scrubber').addEventListener('input',event=>{state.time=Number(event.target.value)/10;if(state.videoUrl)video.currentTime=state.time;draw();});
  $('trim-start').addEventListener('click',()=>{state.trimStart=clamp(state.time,0,state.trimEnd-.1);updateTimeline();saveProject();});$('trim-end').addEventListener('click',()=>{state.trimEnd=clamp(state.time,state.trimStart+.1,state.duration);updateTimeline();saveProject();});
  $('add-keyframe').addEventListener('click',addKeyframe);$('add-frame').addEventListener('click',addFrame);$('export-video').addEventListener('click',exportVideo);$('export-gif').addEventListener('click',exportGif);
  loadProject();
  $('brightness').value=String(state.project.brightness);$('brightness-value').value=`${state.project.brightness}%`;
  $('contrast').value=String(state.project.contrast);$('contrast-value').value=`${state.project.contrast}%`;
  $('saturation').value=String(state.project.saturation);$('saturation-value').value=`${state.project.saturation}%`;
  $('hue').value=String(state.project.hue);$('hue-value').value=`${state.project.hue}°`;
  $('filter-preset').value=state.project.filter;$('audio-mute').checked=Boolean(state.project.mute);
  $('audio-volume').value=String(state.project.volume);$('audio-volume-value').value=`${state.project.volume}%`;
  renderLayers();updateInspector();renderTimeline();draw();
  window.addEventListener('beforeunload',()=>{objectUrls.forEach(url=>URL.revokeObjectURL(url));});
})();

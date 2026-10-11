// Renders Mom's DIY Guide from /data/gub.json. All text is set with textContent.
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function tile(e) {
    var a = el('a', 'tile');
    a.href = '#' + e.id;
    a.appendChild(el('span', 'kind', e.kind));
    a.appendChild(el('h3', '', e.title));
    a.appendChild(el('p', '', e.summary));
    var time = e.details && e.details.Time;
    a.appendChild(el('span', 'meta', time ? 'Time: ' + time : 'Read the steps'));
    return a;
  }

  function block(b) {
    if (b.type === 'h') return el('h3', '', b.text);
    if (b.type === 'p') return el('p', '', b.text);
    if (b.type === 'steps' || b.type === 'list') {
      var list = el(b.type === 'steps' ? 'ol' : 'ul', b.type === 'steps' ? 'steps' : 'bullets');
      (b.items || []).forEach(function (it) { list.appendChild(el('li', '', it)); });
      return list;
    }
    if (b.type === 'note' || b.type === 'warn') {
      var box = el('div', 'callout' + (b.type === 'warn' ? ' warn' : ''));
      box.appendChild(el('strong', '', b.type === 'warn' ? 'Safety' : 'Good to know'));
      box.appendChild(el('span', '', b.text));
      return box;
    }
    return null;
  }

  function entry(e) {
    var sec = el('article', 'entry');
    sec.id = e.id;
    sec.setAttribute('aria-labelledby', e.id + '-title');
    var grid = el('div', 'wrap entry-grid');

    var meta = el('div', 'entry-meta');
    meta.appendChild(el('span', 'kind', e.kind));
    var h = el('h2', '', e.title);
    h.id = e.id + '-title';
    meta.appendChild(h);
    meta.appendChild(el('p', 'summary', e.summary));
    var dl = el('dl', 'facts');
    Object.keys(e.details || {}).forEach(function (k) {
      var row = el('div');
      row.appendChild(el('dt', '', k));
      row.appendChild(el('dd', '', e.details[k]));
      dl.appendChild(row);
    });
    meta.appendChild(dl);
    var ask = el('div', 'ask');
    var askLink = el('a', 'btn solid', 'Ask the helper about this');
    askLink.href = '/';
    var top = el('a', 'btn quiet', 'Back to the list');
    top.href = e.group === 'now' ? '#this-week' : '#pastTitle';
    ask.appendChild(askLink);
    ask.appendChild(top);
    meta.appendChild(ask);

    var body = el('div', 'entry-body');
    (e.body || []).forEach(function (b) { var n = block(b); if (n) body.appendChild(n); });
    if (e.tags && e.tags.length) {
      var tags = el('ul', 'tags');
      tags.setAttribute('aria-label', 'Topics');
      e.tags.slice(0, 8).forEach(function (t) { tags.appendChild(el('li', '', t)); });
      body.appendChild(tags);
    }

    grid.appendChild(meta);
    grid.appendChild(body);
    sec.appendChild(grid);
    return sec;
  }

  var holder = document.getElementById('entries');
  fetch('/data/gub.json', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('status'); return r.json(); })
    .then(function (data) {
      var list = (data && data.entries) || [];
      var now = document.getElementById('nowTiles');
      var past = document.getElementById('pastTiles');
      list.forEach(function (e) {
        (e.group === 'now' ? now : past).appendChild(tile(e));
        holder.appendChild(entry(e));
      });
      if (location.hash.length > 1) {
        var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
    })
    .catch(function () {
      holder.appendChild(el('p', 'wrap load-error', "The guide couldn't load. Refresh the page to try again."));
    });
})();

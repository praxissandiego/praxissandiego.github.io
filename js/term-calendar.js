'use strict';

/**
 * TermCalendar — Praxis Community University
 *
 * A small month calendar of the current term's class meetings, with
 * "add to calendar" downloads (.ics files) for:
 *   - a single meeting,
 *   - every meeting of one class,
 *   - every meeting of several classes picked from the class list.
 *
 * Data comes from two files:
 *   termUrl     -> data/terms/<term>.json           (names, instructors, links)
 *   sessionsUrl -> data/terms/<term>-sessions.json  (meeting dates, times, locations)
 *
 * Everything runs in the browser; no external calendar services are used.
 *
 * Usage:
 *   new TermCalendar('#termCalendar', {
 *       termUrl: '../data/terms/fall2026.json',
 *       sessionsUrl: '../data/terms/fall2026-sessions.json'
 *   });
 */
class TermCalendar {
    constructor(selector, options = {}) {
        this.root = document.querySelector(selector);
        this.opts = Object.assign({
            termUrl: null,
            sessionsUrl: null,
            // Base used to turn class links into full URLs inside calendar files
            linkBase: 'https://praxissandiego.com/university/',
            // Class colors, assigned in table order (a class can override with "color" in the sessions file)
            colors: [
                '#2563eb', // blue
                '#ea580c', // orange
                '#16a34a', // green
                '#7c3aed', // purple
                '#db2777', // pink
                '#0d9488', // teal
                '#ca8a04', // mustard
                '#92400e', // brown
                '#475569'  // slate
            ]
        }, options);

        this.classes = [];            // [{ id, name, instructor, link, external, color, location, sessions }]
        this.byDate = new Map();      // 'YYYY-MM-DD' -> [{ cls, session }]
        this.checked = new Set();     // class ids ticked in the list (empty = show all)
        this.selectedDate = null;     // 'YYYY-MM-DD'
        this.viewYear = 0;
        this.viewMonth = 0;

        if (!this.root) {
            console.warn('TermCalendar: container not found:', selector);
            return;
        }
        this.init();
    }

    /* ──────────────────────────────────────────────
       Loading
       ────────────────────────────────────────────── */

    async init() {
        try {
            const [termRes, sessionsRes] = await Promise.all([
                fetch(this.opts.termUrl),
                fetch(this.opts.sessionsUrl)
            ]);
            if (!termRes.ok) throw new Error('term data: HTTP ' + termRes.status);
            if (!sessionsRes.ok) throw new Error('sessions data: HTTP ' + sessionsRes.status);

            const termData = await termRes.json();
            const sessionsData = await sessionsRes.json();

            this.termName = sessionsData.term || '';
            this.timezone = sessionsData.timezone || 'America/Los_Angeles';
            this.buildData(termData, sessionsData.classes || {});

            if (this.classes.length === 0) {
                this.root.innerHTML = '<p class="tcal-error">No meeting dates have been posted for this term yet.</p>';
                return;
            }

            this.pickInitialView();
            this.renderShell();
            this.renderAll();
        } catch (error) {
            console.error('Error loading term calendar:', error);
            this.root.innerHTML = '<p class="tcal-error">The calendar could not be loaded. The class dates are listed in the table above.</p>';
        }
    }

    buildData(termData, sessionsByClass) {
        const colors = this.opts.colors;

        termData.forEach((item) => {
            const entry = sessionsByClass[item.id];
            if (!entry || !Array.isArray(entry.sessions) || entry.sessions.length === 0) {
                console.warn('TermCalendar: no sessions listed for', item.id);
                return;
            }

            const sessions = entry.sessions
                .slice()
                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

            const cls = {
                id: item.id,
                name: this.stripHtml(item.name),
                instructor: this.stripHtml(item.instructor || ''),
                link: item.link,
                external: /^https?:\/\//.test(item.link),
                color: entry.color || colors[this.classes.length % colors.length],
                location: entry.location || '',
                sessions: []
            };

            sessions.forEach((s, i) => {
                const session = {
                    date: s.date,
                    start: s.start,
                    end: s.end,
                    note: s.note || '',
                    location: s.location || cls.location,
                    number: i + 1,
                    total: sessions.length
                };
                cls.sessions.push(session);

                if (!this.byDate.has(s.date)) this.byDate.set(s.date, []);
                this.byDate.get(s.date).push({ cls, session });
            });

            this.classes.push(cls);
        });

        // Meetings on the same day: earliest first
        for (const list of this.byDate.values()) {
            list.sort((a, b) => a.session.start.localeCompare(b.session.start));
        }

        const allDates = [...this.byDate.keys()].sort();
        this.firstDate = allDates[0];
        this.lastDate = allDates[allDates.length - 1];
        this.allDates = allDates;
    }

    pickInitialView() {
        const today = this.todayISO();
        // Next day with a meeting (today included); otherwise the last one
        const next = this.allDates.find(d => d >= today);
        const focus = next || this.lastDate;
        const [y, m] = focus.split('-').map(Number);
        this.viewYear = y;
        this.viewMonth = m - 1;
        this.selectedDate = next || null;
    }

    /* ──────────────────────────────────────────────
       Rendering
       ────────────────────────────────────────────── */

    renderShell() {
        this.root.innerHTML = `
            <div class="tcal-top">
                <div class="tcal-month">
                    <div class="tcal-nav">
                        <button type="button" class="tcal-nav-btn" data-dir="-1" aria-label="Previous month">←</button>
                        <span class="tcal-title"></span>
                        <button type="button" class="tcal-nav-btn" data-dir="1" aria-label="Next month">→</button>
                    </div>
                    <div class="tcal-grid"></div>
                </div>
                <div class="tcal-day" aria-live="polite"></div>
            </div>
            <div class="tcal-classes">
                <div class="tcal-classes-head">
                    <span class="tcal-classes-title">Classes this term</span>
                    <span class="tcal-classes-tools">
                        <button type="button" class="tcal-link-btn" data-act="all">Select all</button>
                        ·
                        <button type="button" class="tcal-link-btn" data-act="none">Clear</button>
                    </span>
                </div>
                <div class="tcal-list"></div>
                <div class="tcal-actions">
                    <button type="button" class="tcal-btn tcal-btn-primary" data-act="add-checked" disabled>+ Add selected classes</button>
                    <span class="tcal-help">Download a calendar <code>.ics</code> file to add the selected meetings in Apple Calendar, Outlook, Google Calendar (via Import) and most other calendar apps.</span>
                </div>
            </div>
        `;

        this.gridEl = this.root.querySelector('.tcal-grid');
        this.titleEl = this.root.querySelector('.tcal-title');
        this.dayEl = this.root.querySelector('.tcal-day');
        this.listEl = this.root.querySelector('.tcal-list');
        this.prevBtn = this.root.querySelector('[data-dir="-1"]');
        this.nextBtn = this.root.querySelector('[data-dir="1"]');
        this.addCheckedBtn = this.root.querySelector('[data-act="add-checked"]');

        this.root.addEventListener('click', (e) => this.handleClick(e));
        this.root.addEventListener('change', (e) => this.handleChange(e));

        // "+ Add this meeting" menus: close after a choice, on clicks elsewhere, or on Escape
        document.addEventListener('click', (e) => {
            this.root.querySelectorAll('.tcal-menu[open]').forEach(menu => {
                if (!menu.contains(e.target) || e.target.closest('.tcal-menu-item')) {
                    menu.removeAttribute('open');
                }
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            this.root.querySelectorAll('.tcal-menu[open]').forEach(menu => {
                menu.removeAttribute('open');
                menu.querySelector('summary').focus();
            });
        });
    }

    renderAll() {
        this.renderMonth();
        this.renderDay();
        this.renderList();
        this.updateCheckedButton();
    }

    renderMonth() {
        const y = this.viewYear;
        const m = this.viewMonth;
        this.titleEl.textContent = this.monthName(m) + ' ' + y;

        const viewKey = y * 12 + m;
        this.prevBtn.disabled = viewKey <= this.monthKey(this.firstDate);
        this.nextBtn.disabled = viewKey >= this.monthKey(this.lastDate);

        const today = this.todayISO();
        const firstWeekday = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
            .map(d => `<div class="tcal-wd" aria-hidden="true">${d}</div>`)
            .join('');

        for (let i = 0; i < firstWeekday; i++) {
            html += '<div class="tcal-cell tcal-blank" aria-hidden="true"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const iso = this.isoDate(y, m, day);
            const meetings = this.visibleMeetings(iso);
            const classes = ['tcal-cell'];
            if (iso < today) classes.push('tcal-past');
            if (iso === today) classes.push('tcal-today');

            if (meetings.length > 0) {
                classes.push('tcal-has');
                if (iso === this.selectedDate) classes.push('tcal-selected');
                const dots = meetings
                    .map(({ cls }) => `<span class="tcal-dot" style="background-color:${cls.color}"></span>`)
                    .join('');
                const label = this.longDate(iso) + ': ' + meetings.length + (meetings.length === 1 ? ' meeting' : ' meetings');
                html += `<button type="button" class="${classes.join(' ')}" data-date="${iso}" aria-label="${this.escAttr(label)}" aria-pressed="${iso === this.selectedDate}">
                            <span class="tcal-num">${day}</span><span class="tcal-dots">${dots}</span>
                         </button>`;
            } else {
                html += `<div class="${classes.join(' ')}"><span class="tcal-num">${day}</span></div>`;
            }
        }

        this.gridEl.innerHTML = html;
    }

    renderDay() {
        if (!this.selectedDate) {
            this.dayEl.innerHTML = '<p class="tcal-empty">Pick a highlighted day to see which classes meet then.</p>';
            return;
        }

        const meetings = this.visibleMeetings(this.selectedDate);
        let html = `<h3 class="tcal-day-title">${this.esc(this.longDate(this.selectedDate))}</h3>`;

        if (meetings.length === 0) {
            html += '<p class="tcal-empty">None of the selected classes meet on this day.</p>';
            this.dayEl.innerHTML = html;
            return;
        }

        for (const { cls, session } of meetings) {
            const meta = [this.timeRange(session.start, session.end), session.location].filter(Boolean).join(' · ');
            const noteParts = ['Meeting ' + session.number + ' of ' + session.total];
            if (session.note) noteParts.push(session.note);

            html += `
                <div class="tcal-meeting" style="border-left-color:${cls.color}">
                    <div class="tcal-meeting-name"><a href="${this.escAttr(cls.link)}">${this.esc(cls.name)}</a></div>
                    <div class="tcal-meeting-meta">${this.esc(meta)}</div>
                    <div class="tcal-meeting-note">${this.esc(noteParts.join(' · '))}</div>
                    <div class="tcal-meeting-actions">
                        ${this.renderAddMenu(cls, session)}
                        ${session.total > 1 ? `<button type="button" class="tcal-btn" data-add="class" data-id="${cls.id}" title="Downloads a calendar (.ics) file">+ Add all ${session.total} meetings</button>` : ''}
                        <a class="tcal-register" href="${this.escAttr(this.registerLink(cls, false))}">Register here</a>
                    </div>
                </div>`;
        }

        this.dayEl.innerHTML = html;
    }

    // "+ Add this meeting" menu: Google and Outlook open a pre-filled event
    // in the browser; Apple Calendar and "other" get the .ics file.
    renderAddMenu(cls, session) {
        const icsItem = (label) =>
            `<button type="button" class="tcal-menu-item" data-add="one" data-id="${cls.id}" data-date="${session.date}">${label}</button>`;
        const linkItem = (label, href) =>
            `<a class="tcal-menu-item" href="${this.escAttr(href)}" target="_blank" rel="noopener">${label}</a>`;

        return `
            <details class="tcal-menu">
                <summary class="tcal-btn">+ Add this meeting</summary>
                <div class="tcal-menu-list">
                    ${linkItem('Google Calendar', this.googleLink(cls, session))}
                    ${linkItem('Outlook.com', this.outlookLink(cls, session, 'live'))}
                    ${linkItem('Outlook (work or school)', this.outlookLink(cls, session, 'office'))}
                    ${icsItem('Apple Calendar')}
                    ${icsItem('Other (.ics file)')}
                </div>
            </details>`;
    }

    renderList() {
        this.listEl.innerHTML = this.classes.map((cls) => {
            const first = cls.sessions[0].date;
            const last = cls.sessions[cls.sessions.length - 1].date;
            const range = first === last ? this.shortDate(first) : this.shortDate(first) + ' – ' + this.shortDate(last);
            const count = cls.sessions.length + (cls.sessions.length === 1 ? ' meeting' : ' meetings');
            const meta = [this.weekdaysOf(cls), count, range].join(' · ');
            const checked = this.checked.has(cls.id) ? 'checked' : '';

            return `
                <div class="tcal-row">
                    <label class="tcal-row-label">
                        <input type="checkbox" value="${cls.id}" ${checked}>
                        <span class="tcal-swatch" style="background-color:${cls.color}"></span>
                        <span class="tcal-row-text">
                            <span class="tcal-row-name">${this.esc(cls.name)}</span>
                            <span class="tcal-row-meta">${this.esc(meta)}</span>
                        </span>
                    </label>
                    <button type="button" class="tcal-btn tcal-btn-sm" data-add="class" data-id="${cls.id}" aria-label="Add all meetings of ${this.escAttr(cls.name)} to your calendar">+ Add</button>
                </div>`;
        }).join('');
    }

    updateCheckedButton() {
        const n = this.checked.size;
        this.addCheckedBtn.disabled = n === 0;
        this.addCheckedBtn.textContent = n === 0
            ? '+ Add selected classes'
            : '+ Add ' + n + (n === 1 ? ' selected class' : ' selected classes');
    }

    /* ──────────────────────────────────────────────
       Interaction
       ────────────────────────────────────────────── */

    handleClick(e) {
        const navBtn = e.target.closest('[data-dir]');
        if (navBtn) {
            this.changeMonth(Number(navBtn.dataset.dir));
            return;
        }

        const addBtn = e.target.closest('[data-add]');
        if (addBtn) {
            const cls = this.classes.find(c => c.id === addBtn.dataset.id);
            if (!cls) return;
            if (addBtn.dataset.add === 'one') {
                const session = cls.sessions.find(s => s.date === addBtn.dataset.date);
                if (session) this.download([{ cls, session }], `praxis-${cls.id}-${session.date}.ics`, cls.name);
            } else {
                this.download(cls.sessions.map(session => ({ cls, session })), `praxis-${cls.id}.ics`, cls.name);
            }
            return;
        }

        const actBtn = e.target.closest('[data-act]');
        if (actBtn) {
            const act = actBtn.dataset.act;
            if (act === 'all') {
                this.classes.forEach(c => this.checked.add(c.id));
                this.renderAll();
            } else if (act === 'none') {
                this.checked.clear();
                this.renderAll();
            } else if (act === 'add-checked') {
                this.downloadChecked();
            }
            return;
        }

        const dayBtn = e.target.closest('.tcal-cell[data-date]');
        if (dayBtn) {
            this.selectedDate = dayBtn.dataset.date;
            this.renderMonth();
            this.renderDay();
            // Keep keyboard focus on the same day after re-rendering
            const again = this.gridEl.querySelector(`[data-date="${this.selectedDate}"]`);
            if (again) again.focus();
        }
    }

    handleChange(e) {
        const box = e.target.closest('.tcal-row input[type="checkbox"]');
        if (!box) return;
        if (box.checked) this.checked.add(box.value);
        else this.checked.delete(box.value);
        this.renderMonth();
        this.renderDay();
        this.updateCheckedButton();
    }

    changeMonth(delta) {
        let key = this.viewYear * 12 + this.viewMonth + delta;
        key = Math.max(this.monthKey(this.firstDate), Math.min(this.monthKey(this.lastDate), key));
        this.viewYear = Math.floor(key / 12);
        this.viewMonth = key % 12;

        // Select the next meeting day in the new month (or its first one)
        const prefix = this.isoDate(this.viewYear, this.viewMonth, 1).slice(0, 7);
        const inMonth = this.allDates.filter(d => d.startsWith(prefix));
        const today = this.todayISO();
        this.selectedDate = inMonth.find(d => d >= today) || inMonth[0] || null;

        this.renderMonth();
        this.renderDay();
    }

    downloadChecked() {
        const chosen = this.classes.filter(c => this.checked.has(c.id));
        if (chosen.length === 0) return;
        const items = [];
        chosen.forEach(cls => cls.sessions.forEach(session => items.push({ cls, session })));
        items.sort((a, b) => (a.session.date + a.session.start).localeCompare(b.session.date + b.session.start));

        const slug = (this.termName || 'term').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = chosen.length === 1
            ? `praxis-${chosen[0].id}.ics`
            : `praxis-${slug}-classes.ics`;
        const calName = chosen.length === 1 ? chosen[0].name : 'Praxis CU ' + this.termName;
        this.download(items, filename, calName);
    }

    /* ──────────────────────────────────────────────
       .ics generation
       ────────────────────────────────────────────── */

    download(items, filename, calName) {
        const ics = this.buildICS(items, calName);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke later: some browsers start the download asynchronously
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    buildICS(items, calName) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const tz = this.timezone;

        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Praxis San Diego//Community University//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' + this.icsText(calName || 'Praxis Community University'),
            'X-WR-TIMEZONE:' + tz
        ];
        if (tz === 'America/Los_Angeles') lines.push(...TermCalendar.LA_TIMEZONE);

        for (const { cls, session } of items) {
            const day = session.date.replace(/-/g, '');
            const info = this.absoluteLink(cls.link);
            const description = this.describe(cls, session).join('\n');

            lines.push(
                'BEGIN:VEVENT',
                `UID:${cls.id}-${day}@praxissandiego.com`,
                'DTSTAMP:' + stamp,
                `DTSTART;TZID=${tz}:${day}T${session.start.replace(':', '')}00`,
                `DTEND;TZID=${tz}:${day}T${session.end.replace(':', '')}00`,
                'SUMMARY:' + this.icsText(cls.name),
                session.location ? 'LOCATION:' + this.icsText(session.location) : '',
                'DESCRIPTION:' + this.icsText(description),
                'URL:' + info,
                'END:VEVENT'
            );
        }

        lines.push('END:VCALENDAR');
        return lines.filter(Boolean).map(line => this.foldLine(line)).join('\r\n') + '\r\n';
    }

    // Text that goes into every calendar entry, one string per line
    describe(cls, session) {
        const info = this.absoluteLink(cls.link);
        const register = this.registerLink(cls, true);
        const lines = ['Meeting ' + session.number + ' of ' + session.total + (session.note ? ': ' + session.note : '')];
        if (cls.instructor) lines.push('Instructor: ' + cls.instructor);
        lines.push('', 'Register here: ' + register);
        if (register !== info) lines.push('Class info: ' + info);
        lines.push('', 'Praxis Community University' + (this.termName ? ', ' + this.termName : ''));
        return lines;
    }

    /* ──────────────────────────────────────────────
       "Add event" links for Google Calendar and Outlook
       (single events only — neither service supports more)
       ────────────────────────────────────────────── */

    googleLink(cls, session) {
        const day = session.date.replace(/-/g, '');
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: cls.name,
            dates: `${day}T${session.start.replace(':', '')}00/${day}T${session.end.replace(':', '')}00`,
            ctz: this.timezone,
            details: this.describe(cls, session).join('\n'),
            location: session.location || ''
        });
        return 'https://calendar.google.com/calendar/render?' + params.toString();
    }

    // host: 'live' for personal Outlook.com accounts, 'office' for work/school (Microsoft 365)
    outlookLink(cls, session, host) {
        // Outlook's event body is HTML, so escape the text and use <br> for line breaks
        const body = this.describe(cls, session).map(line => this.esc(line)).join('<br>');
        const params = new URLSearchParams({
            path: '/calendar/action/compose',
            rru: 'addevent',
            subject: cls.name,
            startdt: this.utcString(session.date, session.start),
            enddt: this.utcString(session.date, session.end),
            body: body,
            location: session.location || ''
        });
        return `https://outlook.${host}.com/calendar/0/deeplink/compose?` + params.toString();
    }

    // 'YYYY-MM-DD' + 'HH:MM' in the term's timezone -> 'YYYY-MM-DDTHH:MM:SSZ' (UTC)
    utcString(date, time) {
        const [y, mo, d] = date.split('-').map(Number);
        const [h, mi] = time.split(':').map(Number);
        const wallClock = Date.UTC(y, mo - 1, d, h, mi);
        let ts = wallClock - this.tzOffset(wallClock);
        ts = wallClock - this.tzOffset(ts); // second pass settles daylight-saving edges
        return new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    // Milliseconds the term's timezone is ahead of UTC at a given moment
    tzOffset(ts) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: this.timezone, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(new Date(ts));
        const get = (type) => Number(parts.find(p => p.type === type).value);
        return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ts;
    }

    // Escape text values per RFC 5545
    icsText(s) {
        return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\r?\n/g, '\\n');
    }

    // Fold lines longer than 75 bytes (UTF-8), without splitting characters
    foldLine(line) {
        const encoder = new TextEncoder();
        if (encoder.encode(line).length <= 75) return line;
        const parts = [];
        let current = '';
        let bytes = 0;
        let limit = 75;
        for (const ch of line) {
            const size = encoder.encode(ch).length;
            if (bytes + size > limit) {
                parts.push(current);
                current = '';
                bytes = 0;
                limit = 74; // continuation lines start with a space
            }
            current += ch;
            bytes += size;
        }
        parts.push(current);
        return parts.join('\r\n ');
    }

    /* ──────────────────────────────────────────────
       Helpers
       ────────────────────────────────────────────── */

    visibleMeetings(iso) {
        const all = this.byDate.get(iso) || [];
        if (this.checked.size === 0) return all;
        return all.filter(({ cls }) => this.checked.has(cls.id));
    }

    registerLink(cls, absolute) {
        if (cls.external) return cls.link;
        const link = cls.link + '#apply';
        return absolute ? this.absoluteLink(link) : link;
    }

    absoluteLink(link) {
        try {
            return new URL(link, this.opts.linkBase).href;
        } catch (e) {
            return link;
        }
    }

    weekdaysOf(cls) {
        const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
        const seen = [];
        cls.sessions.forEach(s => {
            const wd = this.parseDate(s.date).getDay();
            if (!seen.includes(wd)) seen.push(wd);
        });
        // Order Monday-first, Sunday last
        seen.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        return seen.map(d => names[d]).join(' & ');
    }

    timeRange(start, end) {
        const parts = (t) => {
            const [h, m] = t.split(':').map(Number);
            return { text: (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : ''), ampm: h >= 12 ? 'pm' : 'am' };
        };
        const a = parts(start);
        const b = parts(end);
        return a.ampm === b.ampm
            ? `${a.text}–${b.text}${b.ampm}`
            : `${a.text}${a.ampm}–${b.text}${b.ampm}`;
    }

    parseDate(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    isoDate(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    todayISO() {
        const now = new Date();
        return this.isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    }

    monthKey(iso) {
        const [y, m] = iso.split('-').map(Number);
        return y * 12 + (m - 1);
    }

    longDate(iso) {
        return this.parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    shortDate(iso) {
        return this.parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    monthName(m) {
        return ['January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'][m];
    }

    stripHtml(s) {
        const div = document.createElement('div');
        div.innerHTML = s;
        return (div.textContent || '').trim();
    }

    esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    escAttr(s) {
        return this.esc(s).replace(/"/g, '&quot;');
    }
}

/**
 * Makes a <details> section (e.g. the calendar) open and close nicely:
 *  - closed by default, but remembers if the visitor left it open last time,
 *  - opens when the page is loaded with its #id in the address,
 *    or when a link to it (e.g. href="#calendar") is clicked.
 */
TermCalendar.setupCollapsible = function (selector, storageKey) {
    const section = document.querySelector(selector);
    if (!section) return;
    const hash = '#' + section.id;

    try {
        if (localStorage.getItem(storageKey) === 'open') section.open = true;
    } catch (e) { /* storage blocked: just start closed */ }

    if (window.location.hash === hash) section.open = true;

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link && link.hash === hash && link.pathname === window.location.pathname) {
            section.open = true;
        }
    });
    window.addEventListener('hashchange', () => {
        if (window.location.hash === hash) section.open = true;
    });

    section.addEventListener('toggle', () => {
        try {
            localStorage.setItem(storageKey, section.open ? 'open' : 'closed');
        } catch (e) { /* storage blocked: nothing to remember */ }
    });
};

// Pacific time definition included in every file so all calendar apps
// (Outlook in particular) place the meetings at the right local time.
TermCalendar.LA_TIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'X-LIC-LOCATION:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
];

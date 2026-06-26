import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadCsv } from "./lib/csv.js";
import {
  byKey,
  normaliseMemberApiRows,
  clean,
  canonicalMemberCode,
} from "./lib/joins.js";
import ChamberMap from "./components/ChamberMap.jsx";
import SeatPanel from "./components/SeatPanel.jsx";
import membersJson from "./data/members.json";
import { normaliseVotesDataset } from "./lib/votes.js";
import "./styles.css";

function formatIrishDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function parseIsoDateStart(isoDate) {
  if (!isoDate) return Number.NaN;
  return new Date(`${isoDate}T00:00:00`).getTime();
}

function parseIsoDateEnd(isoDate) {
  if (!isoDate) return Infinity;
  return new Date(`${isoDate}T23:59:59.999`).getTime();
}

function resolveSeatForDate(rows, memberCode, voteDate) {
  if (!memberCode || !voteDate) return null;

  const voteTime = parseIsoDateStart(voteDate);
  const normalizedMemberCode = canonicalMemberCode(memberCode);
  let bestMatch = null;
  let bestStart = -Infinity;

  for (const row of rows) {
    const rowMemberCode = canonicalMemberCode(
      row.member_code ?? row.memberCode,
    );
    if (rowMemberCode !== normalizedMemberCode) continue;

    const start = parseIsoDateStart(row.start_date);
    const end = parseIsoDateEnd(row.end_date);

    if (Number.isNaN(start)) continue;
    if (voteTime < start || voteTime > end) continue;

    if (start > bestStart) {
      bestMatch = row;
      bestStart = start;
    }
  }

  return bestMatch;
}

function makeVoteOptionLabel(vote) {
  const date = formatIrishDate(vote.date);
  const title = vote.debateShowAs || "Division";
  return date ? `${date} | ${title}` : title;
}

function extractSectionNumber(section) {
  if (!section) return "";
  const match = String(section).match(/(\d+)$/);
  return match ? match[1] : "";
}

function buildDebateUrl(date, section) {
  const sectionNumber = extractSectionNumber(section);
  if (!date || !sectionNumber) return null;
  return `https://www.oireachtas.ie/en/debates/debate/seanad/${date}/${sectionNumber}/`;
}

function getVoteOrderNumber(vote) {
  const raw = vote.voteID || vote.id || "";
  const match = String(raw).match(/(\d+)$/);
  return match ? Number(match[1]) : -1;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildVoteCsv(rows) {
  const headers = [
    "name",
    "party",
    "constituency",
    "vote_subject",
    "vote_result",
    "vote_cast",
    "date",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(","),
    ),
  ];

  return lines.join("\n");
}

function downloadTextFile(filename, content, mimeType) {
  const isCsv = mimeType.includes("text/csv");
  const payload = isCsv ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function buildVoteFilenameBase(selectedVote) {
  const safeTitle = sanitizeFilenamePart(selectedVote?.debateShowAs || "vote");
  const safeDate = sanitizeFilenamePart(formatIrishDate(selectedVote?.date));
  return `${safeTitle}_${safeDate}`;
}

function serializeSvg(svgNode) {
  const clone = svgNode.cloneNode(true);

  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }

  return new XMLSerializer().serializeToString(clone);
}

function downloadSvgFromNode(svgNode, filename) {
  if (!svgNode) return;

  const source = serializeSvg(svgNode);
  const blob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPngFromSvgNode(svgNode, filename) {
  if (!svgNode) return;

  const source = serializeSvg(svgNode);
  const svgBlob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  img.onload = () => {
    const svgRect = svgNode.getBoundingClientRect();
    const viewBox = svgNode.viewBox?.baseVal;
    const width = Math.round(viewBox?.width || svgRect.width || 1200);
    const height = Math.round(viewBox?.height || svgRect.height || 700);

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }

    ctx.scale(scale, scale);
    ctx.fillStyle = "#f6f3ea";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) {
        URL.revokeObjectURL(url);
        return;
      }

      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(pngUrl);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function useIframeResize() {
  useEffect(() => {
    function sendHeight() {
      const height =
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ) + 8;

      window.parent.postMessage(
        {
          type: "vote-explorer:resize",
          height,
        },
        "*",
      );
    }

    const timeoutId = setTimeout(sendHeight, 100);

    const resizeObserver = new ResizeObserver(() => {
      sendHeight();
    });

    if (document.body) {
      resizeObserver.observe(document.body);
    }

    window.addEventListener("load", sendHeight);
    window.addEventListener("resize", sendHeight);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener("load", sendHeight);
      window.removeEventListener("resize", sendHeight);
    };
  }, []);
}

export default function App() {
  useIframeResize();

  const [assignments, setAssignments] = useState([]);
  const [members, setMembers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [selectedVoteId, setSelectedVoteId] = useState("");
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [query, setQuery] = useState("");
  const [voteFilter, setVoteFilter] = useState(null);
  const [votesLoading, setVotesLoading] = useState(true);
  const [votesError, setVotesError] = useState("");
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [votePickerOpen, setVotePickerOpen] = useState(false);
  const [voteSearch, setVoteSearch] = useState("");

  const mapPanelRef = useRef(null);
  const downloadsRef = useRef(null);
  const votePickerRef = useRef(null);
  const voteSearchInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      const seatingRowsRaw = await loadCsv(
        `${import.meta.env.BASE_URL}seatAssignmentsHistory.csv`,
      );

      const seatingRows = seatingRowsRaw.map((row) => ({
        ...row,
        seat_label: clean(row.seat_label),
        deputy_name: clean(row.deputy_name ?? row.Deputy),
        member_code: canonicalMemberCode(row.member_code ?? row.memberCode),
        path_id: clean(row.path_id),
      }));

      setAssignments(seatingRows);
      setMembers(normaliseMemberApiRows(membersJson));
    }

    init();
  }, []);

  useEffect(() => {
    async function loadVotes() {
      setVotesLoading(true);
      setVotesError("");

      try {
        const res = await fetch(
          `${import.meta.env.BASE_URL}data/voteDetails.json`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch vote data (${res.status})`);
        }

        const json = await res.json();
        const normalised = normaliseVotesDataset(json).sort((a, b) => {
          const dateDiff = String(b.date).localeCompare(String(a.date));
          if (dateDiff !== 0) return dateDiff;

          const voteDiff = getVoteOrderNumber(b) - getVoteOrderNumber(a);
          if (voteDiff !== 0) return voteDiff;

          return String(b.id).localeCompare(String(a.id));
        });

        setVotes(normalised);
        setSelectedVoteId(normalised[0]?.id || "");
      } catch (err) {
        console.error(err);
        setVotesError("Unable to load vote data.");
      } finally {
        setVotesLoading(false);
      }
    }

    loadVotes();
  }, []);

  useEffect(() => {
    if (votePickerOpen && voteSearchInputRef.current) {
      voteSearchInputRef.current.focus();
    }
  }, [votePickerOpen]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        downloadsRef.current &&
        !downloadsRef.current.contains(event.target)
      ) {
        setDownloadsOpen(false);
      }
      if (
        votePickerRef.current &&
        !votePickerRef.current.contains(event.target)
      ) {
        setVotePickerOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setDownloadsOpen(false);
        setVotePickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectedVote = useMemo(() => {
    const vote = votes.find((v) => v.id === selectedVoteId) || null;
    if (!vote) return null;

    return {
      ...vote,
      debateUrl: buildDebateUrl(vote.date, vote.section),
    };
  }, [votes, selectedVoteId]);

  const filteredVoteOptions = useMemo(() => {
    const q = voteSearch.trim().toLowerCase();
    if (!q) return votes;

    return votes.filter((vote) => {
      const haystack = [
        vote.debateShowAs,
        vote.subject,
        vote.date,
        formatIrishDate(vote.date),
        vote.voteID,
        vote.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [votes, voteSearch]);

  const voteSummaryItems = useMemo(() => {
    if (!selectedVote) return [];

    const tallyYes = selectedVote.tallies?.["Tá"] ?? 0;
    const tallyNo = selectedVote.tallies?.["Níl"] ?? 0;
    const tallyAbstain = selectedVote.tallies?.["Staon"] ?? 0;

    return [
      {
        key: "Tá",
        label: "Tá",
        count: tallyYes,
        active: voteFilter === "Tá",
        className: "vote-summary__item--yes",
        value: "Tá",
        showCount: true,
      },
      {
        key: "Níl",
        label: "Níl",
        count: tallyNo,
        active: voteFilter === "Níl",
        className: "vote-summary__item--no",
        value: "Níl",
        showCount: true,
      },
      {
        key: "Staon",
        label: "Staon",
        count: tallyAbstain,
        active: voteFilter === "Staon",
        className: "vote-summary__item--abstain",
        value: "Staon",
        showCount: true,
      },
      {
        key: "Clear",
        label: "All",
        count: null,
        active: voteFilter === null,
        className: "vote-summary__item--all",
        value: null,
        showCount: false,
      },
    ];
  }, [selectedVote, voteFilter]);

  const membersByCode = useMemo(() => byKey(members, "Code"), [members]);

  const seats = useMemo(() => {
    if (!selectedVote) return [];

    return members
      .map((member) => {
        const assignment = resolveSeatForDate(
          assignments,
          member.Code,
          selectedVote.date,
        );

        if (!assignment?.seat_label) return null;

        const vote =
          selectedVote.byMemberCode?.[canonicalMemberCode(member.Code)] || null;

        return {
          seat_label: clean(assignment.seat_label),
          assignment,
          member,
          vote,
        };
      })
      .filter(Boolean);
  }, [assignments, members, selectedVote, membersByCode]);

  const filteredSeats = useMemo(() => {
    const q = query.toLowerCase();

    return seats.filter((seat) => {
      const haystack = [
        seat.seat_label,
        seat.member?.Deputy,
        seat.member?.Party,
        seat.member?.Constituency,
        seat.assignment?.group,
        seat.vote?.vote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [seats, query]);

  const currentVoteDownloadRows = useMemo(() => {
    if (!selectedVote) return [];

    return seats
      .filter((seat) => seat.member)
      .map((seat) => ({
        name: seat.member?.Deputy || "",
        party: seat.member?.Party || "",
        constituency: seat.member?.Constituency || "",
        vote_subject: selectedVote?.subject || "",
        vote_result: selectedVote?.outcome || "",
        vote_cast: seat.vote?.vote || "",
        date: selectedVote?.date || "",
      }));
  }, [seats, selectedVote]);

  function handleDownloadCurrentVoteCsv() {
    if (!selectedVote || currentVoteDownloadRows.length === 0) return;

    const csv = buildVoteCsv(currentVoteDownloadRows);
    const filename = `${buildVoteFilenameBase(selectedVote)}.csv`;

    downloadTextFile(filename, csv, "text/csv;charset=utf-8;");
    setDownloadsOpen(false);
  }

  function getMapSvgNode() {
    return mapPanelRef.current?.querySelector(".map-svg-frame svg") || null;
  }

  function handleDownloadSvg() {
    const svgNode = getMapSvgNode();
    if (!svgNode || !selectedVote) return;

    downloadSvgFromNode(svgNode, `${buildVoteFilenameBase(selectedVote)}.svg`);
    setDownloadsOpen(false);
  }

  function handleDownloadPng() {
    const svgNode = getMapSvgNode();
    if (!svgNode || !selectedVote) return;

    downloadPngFromSvgNode(
      svgNode,
      `${buildVoteFilenameBase(selectedVote)}.png`,
    );
    setDownloadsOpen(false);
  }

  function handleSelectVote(voteId) {
    setSelectedVoteId(voteId);
    setSelectedSeat(null);
    setVoteFilter(null);
    setVotePickerOpen(false);
    setVoteSearch("");
  }

  const selected =
    seats.find((seat) => seat.seat_label === selectedSeat) || null;
  const hasSelection = Boolean(selected);

  return (
    <div className="app">
      <header>
        <section className="hero">
          <div className="hero__media">
            <video
              className="hero__video"
              src={`${import.meta.env.BASE_URL}media/chamber-vote-hero.mp4`}
              autoPlay
              muted
              loop
              playsInline
            />
          </div>

          <div className="hero__overlay">
            <div className="hero__content">
              <p className="hero__eyebrow">Open data insights</p>
              <h1 className="hero__title">Vote Explorer: Seanad</h1>
              <p className="hero__subtitle">
                Explore how Senators voted in Seanad Éireann with an interactive
                Chamber map.
              </p>
            </div>
          </div>
        </section>

        <div className="intro-copy">
          Votes cast in the Seanad Chamber, referred to formally as{" "}
          <strong>divisions of the House</strong>, are an intrinsic part of
          parliamentary business. Each Senator is entitled to cast a vote and in
          doing so can influence each piece of business considered by
          Parliament.
        </div>

        <section className="hero-controls">
          <div className="controls controls--single">
            <label className="control-label" htmlFor="vote-picker-trigger">
              Select a vote
            </label>

            <div className="vote-picker" ref={votePickerRef}>
              <button
                id="vote-picker-trigger"
                type="button"
                className="vote-picker__trigger"
                aria-haspopup="dialog"
                aria-expanded={votePickerOpen}
                onClick={() => setVotePickerOpen((open) => !open)}
                disabled={votesLoading || votes.length === 0}
              >
                <span className="vote-picker__trigger-text">
                  {votesLoading
                    ? "Loading votes…"
                    : selectedVote
                      ? makeVoteOptionLabel(selectedVote)
                      : "No votes available"}
                </span>
              </button>

              {votePickerOpen ? (
                <div
                  className="vote-picker__menu"
                  role="dialog"
                  aria-label="Select a vote"
                >
                  <div className="vote-picker__search-wrap">
                    <input
                      ref={voteSearchInputRef}
                      type="text"
                      className="vote-picker__search"
                      value={voteSearch}
                      onChange={(e) => setVoteSearch(e.target.value)}
                      placeholder="Search votes by date or title"
                      aria-label="Search votes"
                    />
                  </div>

                  <div className="vote-picker__results">
                    {filteredVoteOptions.length === 0 ? (
                      <div className="vote-picker__empty">
                        No matching votes
                      </div>
                    ) : (
                      filteredVoteOptions.map((vote) => (
                        <button
                          key={vote.id}
                          type="button"
                          className={`vote-picker__option${
                            vote.id === selectedVoteId
                              ? " vote-picker__option--active"
                              : ""
                          }`}
                          onClick={() => handleSelectVote(vote.id)}
                        >
                          <span className="vote-picker__option-date">
                            {formatIrishDate(vote.date)}
                          </span>
                          <span className="vote-picker__option-title">
                            {vote.debateShowAs || "Division"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </header>

      <main className="layout layout--stacked">
        {votesError ? (
          <section className="panel">
            <p>{votesError}</p>
          </section>
        ) : null}

        <section className="main-panel main-panel--full" ref={mapPanelRef}>
          {selectedVote ? (
            <div className="vote-header">
              <div className="vote-debate-meta">
                <span className="vote-debate-meta__label">Debate</span>

                {selectedVote.debateUrl ? (
                  <a
                    href={selectedVote.debateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vote-debate-meta__link"
                  >
                    {selectedVote.debateShowAs || "—"}
                  </a>
                ) : (
                  <span className="vote-debate-meta__value">
                    {selectedVote.debateShowAs || "—"}
                  </span>
                )}
              </div>

              <div
                className={`vote-summary${
                  voteFilter ? " vote-summary--has-active" : ""
                }`}
              >
                {voteSummaryItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`vote-summary__item ${item.className}${
                      item.active ? " vote-summary__item--active" : ""
                    }`}
                    onClick={() => {
                      setVoteFilter(item.value);
                      setSelectedSeat(null);
                    }}
                    aria-pressed={item.active}
                    title={
                      item.value === null
                        ? "Clear vote filter"
                        : item.active
                          ? `Showing ${item.label}`
                          : `Focus ${item.label}`
                    }
                  >
                    <span className="vote-summary__dot" />
                    {item.label}
                    {item.showCount ? ` ${item.count}` : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="map-actions" ref={downloadsRef}>
            <button
              type="button"
              className="map-actions__toggle"
              aria-haspopup="menu"
              aria-expanded={downloadsOpen}
              aria-label="Download options"
              title="Download options"
              onClick={() => setDownloadsOpen((open) => !open)}
            >
              ⋮
            </button>

            {downloadsOpen ? (
              <div className="map-actions__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDownloadCurrentVoteCsv}
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDownloadPng}
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDownloadSvg}
                >
                  Download SVG
                </button>
              </div>
            ) : null}
          </div>

          <ChamberMap
            seats={filteredSeats}
            allSeats={seats}
            selectedSeat={selectedSeat}
            onSelect={setSelectedSeat}
            displayMode="vote"
            voteFilter={voteFilter}
          />
        </section>

        <section className="panel panel--search">
          <label className="control-label" htmlFor="member-search">
            Filter Senators
          </label>
          <div className="search-input-wrap">
            <input
              id="member-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by Senator, panel or party"
              aria-label="Filter by Senator, panel or party"
            />
            {query ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                title="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
        </section>

        <section
          className={
            hasSelection ? "detail-grid" : "detail-grid detail-grid--single"
          }
        >
          {selectedVote ? (
            <section className="panel panel--detail">
              <div className="vote-context-card">
                <div className="vote-context-card__item">
                  <span className="vote-context-card__label">
                    Division called
                  </span>

                  {selectedVote.debateUrl ? (
                    <a
                      href={selectedVote.debateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vote-context-card__link"
                    >
                      {selectedVote.subject || "—"}
                    </a>
                  ) : (
                    <span className="vote-context-card__value">
                      {selectedVote.subject || "—"}
                    </span>
                  )}
                </div>

                <div className="vote-context-card__item">
                  <span className="vote-context-card__label">Outcome</span>
                  <span className="vote-context-card__value">
                    {selectedVote.outcome || "—"}
                  </span>
                </div>

                <div className="vote-context-card__item">
                  <span className="vote-context-card__label">Tellers</span>
                  <span className="vote-context-card__value">
                    {selectedVote.tellers || "—"}
                  </span>
                </div>

                <div className="vote-context-card__item">
                  <span className="vote-context-card__label">Date</span>
                  <span className="vote-context-card__value">
                    {formatIrishDate(selectedVote.date) || "—"}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          {hasSelection ? (
            <SeatPanel seat={selected} displayMode="vote" />
          ) : null}
        </section>

        <section className="download-block">
          <button
            type="button"
            className="pq-download"
            onClick={handleDownloadCurrentVoteCsv}
            disabled={!selectedVote}
          >
            Download the vote data
          </button>
        </section>
      </main>
    </div>
  );
}

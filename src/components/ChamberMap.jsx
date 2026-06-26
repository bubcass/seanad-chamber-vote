import React, { useEffect, useRef, useState } from "react";
import chamberSvg from "../data/chamber.svg?raw";
import { voteColorMap } from "../lib/votes.js";

const EMPTY_SEAT_COLOR = "#ffffff";
const FILTERED_SEAT_COLOR = "#ece9e2";
const BASE_STROKE = "rgba(255,255,255,0.72)";
const FILTERED_STROKE = "rgba(255,255,255,0.34)";
const HOVER_STROKE = "rgba(255,255,255,0.94)";
const SELECTED_STROKE = "rgba(255,255,255,0.98)";

export default function ChamberMap({
  seats = [],
  allSeats = [],
  selectedSeat,
  onSelect,
  displayMode = "vote",
  voteFilter = null,
}) {
  const ref = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [hoveredSeat, setHoveredSeat] = useState(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const svgRoot = root.querySelector(".map-svg-frame");
    if (!svgRoot) return;

    const seatEls = svgRoot.querySelectorAll(".seat[data-seat]");
    const shapeSelector = "path, ellipse, rect, polygon, circle";

    const getSeatData = (seatLabel) =>
      allSeats.find((d) => d.seat_label === seatLabel) || null;

    const visibleSeatLabels = new Set(seats.map((d) => d.seat_label));

    const paintSeat = (el) => {
      const seatLabel = el.getAttribute("data-seat");
      const seat = getSeatData(seatLabel);

      const baseFill =
        displayMode === "vote"
          ? seat?.member
            ? voteColorMap[seat?.vote?.vote || "Absent"]
            : EMPTY_SEAT_COLOR
          : EMPTY_SEAT_COLOR;

      const isSelected = seatLabel === selectedSeat;
      const isHovered = seatLabel === hoveredSeat;
      const passesSearch = visibleSeatLabels.has(seatLabel);
      const passesVoteFilter = !voteFilter || seat?.vote?.vote === voteFilter;
      const dimmed = !passesSearch || !passesVoteFilter;
      const fill = dimmed ? FILTERED_SEAT_COLOR : baseFill;

      const applyStateToShape = (shape) => {
        shape.style.fill = fill;
        shape.setAttribute("fill", fill);
        shape.style.transition =
          "fill 0.25s ease, opacity 0.2s ease, stroke 0.2s ease, filter 0.2s ease";
        shape.style.strokeLinejoin = "round";
        shape.style.strokeLinecap = "round";

        if (isSelected) {
          shape.style.stroke = SELECTED_STROKE;
          shape.style.strokeWidth = "1.45";
          shape.style.filter =
            "brightness(0.99) drop-shadow(0 0 3px rgba(17,24,39,0.08))";
          shape.style.opacity = "1";
        } else if (isHovered && !dimmed) {
          shape.style.stroke = HOVER_STROKE;
          shape.style.strokeWidth = "1.0";
          shape.style.filter =
            "brightness(1.01) drop-shadow(0 0 3px rgba(17,24,39,0.05))";
          shape.style.opacity = "0.98";
        } else {
          shape.style.stroke = dimmed ? FILTERED_STROKE : BASE_STROKE;
          shape.style.strokeWidth = dimmed ? "0.24" : "0.46";
          shape.style.filter = "none";
          shape.style.opacity = dimmed ? "0.52" : "1";
        }
      };

      if (el.tagName.toLowerCase() === "g") {
        el.querySelectorAll(shapeSelector).forEach(applyStateToShape);
      } else {
        applyStateToShape(el);
      }

      el.style.cursor = dimmed ? "default" : "pointer";
      el.style.pointerEvents = dimmed ? "none" : "auto";
    };

    seatEls.forEach(paintSeat);

    const findSeatEl = (target) => {
      if (!(target instanceof Element)) return null;
      return target.closest(".seat[data-seat]");
    };

    const handlePointerMove = (event) => {
      const seatEl = findSeatEl(event.target);

      if (!seatEl) {
        if (hoveredSeat !== null) setHoveredSeat(null);
        setTooltip(null);
        return;
      }

      const seatLabel = seatEl.getAttribute("data-seat");
      const seat = getSeatData(seatLabel);
      const passesSearch = visibleSeatLabels.has(seatLabel);
      const passesVoteFilter = !voteFilter || seat?.vote?.vote === voteFilter;

      if (!passesSearch || !passesVoteFilter) {
        setHoveredSeat(null);
        setTooltip(null);
        return;
      }

      if (hoveredSeat !== seatLabel) {
        setHoveredSeat(seatLabel);
      }

      if (!seat?.member) {
        setTooltip(null);
        return;
      }

      const containerRect = root.getBoundingClientRect();

      setTooltip({
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top - 14,
        name: seat.member.Deputy,
        party: seat.member.Party,
        panel: seat.member.Constituency || "",
        group: seat.assignment?.group || "",
        image: seat.member.imageUrl || "",
        vote: seat.vote?.vote || null,
      });
    };

    const handlePointerLeave = () => {
      setHoveredSeat(null);
      setTooltip(null);
    };

    const handleClick = (event) => {
      const seatEl = findSeatEl(event.target);
      if (!seatEl) return;

      const seatLabel = seatEl.getAttribute("data-seat");
      const seat = getSeatData(seatLabel);
      const passesSearch = visibleSeatLabels.has(seatLabel);
      const passesVoteFilter = !voteFilter || seat?.vote?.vote === voteFilter;

      if (!passesSearch || !passesVoteFilter) return;

      onSelect?.(seatLabel);
    };

    svgRoot.addEventListener("pointermove", handlePointerMove);
    svgRoot.addEventListener("pointerleave", handlePointerLeave);
    svgRoot.addEventListener("click", handleClick);

    return () => {
      svgRoot.removeEventListener("pointermove", handlePointerMove);
      svgRoot.removeEventListener("pointerleave", handlePointerLeave);
      svgRoot.removeEventListener("click", handleClick);
    };
  }, [
    seats,
    allSeats,
    selectedSeat,
    hoveredSeat,
    onSelect,
    displayMode,
    voteFilter,
  ]);

  return (
    <div className="map-wrap map-wrap--interactive" ref={ref}>
      <div
        className="map-svg-frame"
        dangerouslySetInnerHTML={{ __html: chamberSvg }}
      />

      {tooltip ? (
        <div
          className="map-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="map-tooltip__row">
            {tooltip.image ? (
              <img
                src={tooltip.image}
                alt=""
                className="map-tooltip__avatar"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}

            <div className="map-tooltip__text">
              <div className="map-tooltip__name">{tooltip.name}</div>

              {tooltip.group ? (
                <div className="map-tooltip__constituency">{tooltip.group}</div>
              ) : null}

              <div className="map-tooltip__party">{tooltip.party}</div>

              {tooltip.panel ? (
                <div className="map-tooltip__constituency">{tooltip.panel}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

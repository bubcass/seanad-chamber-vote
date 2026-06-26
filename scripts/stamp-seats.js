import fs from "node:fs";
import Papa from "papaparse";

const svgPath = "./src/data/chamber.svg";
const csvPath = "./public/seatAssignmentsHistory.csv";

const svg = fs.readFileSync(svgPath, "utf8");
const csv = fs.readFileSync(csvPath, "utf8");

const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
const usedPathIds = parsed
  .map((row) => Number.parseInt(String(row.path_id || "").trim(), 10))
  .filter(Number.isFinite);

let updated = svg;

for (const row of parsed) {
  const pathId = String(row.path_id || "").trim();
  const seatLabel = String(row.seat_label || "").trim();
  if (!pathId || !seatLabel) continue;

  const regex = new RegExp(`<path([^>]*?)id="path${pathId}"([^>]*?)\\/?>`, "g");

  updated = updated.replace(regex, (match, before, after) => {
    let attrs = `${before}id="path${pathId}"${after}`;
    attrs = attrs.replace(/\sclass="seat"/g, "");
    attrs = attrs.replace(/\sdata-seat="[^"]*"/g, "");
    attrs = attrs.replace(/style="([^"]*)"/g, (_, styleValue) => {
      const sanitised = styleValue
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter(
          (part) =>
            !/^fill\s*:/i.test(part) &&
            !/^fill-opacity\s*:/i.test(part) &&
            !/^stroke\s*:/i.test(part) &&
            !/^stroke-width\s*:/i.test(part),
        );

      return sanitised.length ? `style="${sanitised.join(";")}"` : "";
    });
    return `<path${attrs} class="seat" data-seat="${seatLabel}" />`;
  });
}

const seatPathMin = Math.min(...usedPathIds.filter((id) => id >= 2000)) - 1;
const seatPathMax = Math.max(...usedPathIds);

for (let pathId = seatPathMin; pathId <= seatPathMax; pathId += 1) {
  if (usedPathIds.includes(pathId)) continue;

  const regex = new RegExp(`<path([^>]*?)id="path${pathId}"([^>]*?)\\/?>`, "g");

  updated = updated.replace(regex, (match, before, after) => {
    let attrs = `${before}id="path${pathId}"${after}`;
    attrs = attrs.replace(/style="([^"]*)"/g, (_, styleValue) => {
      const sanitised = styleValue
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter(
          (part) =>
            !/^fill\s*:/i.test(part) &&
            !/^fill-opacity\s*:/i.test(part),
        );

      return `style="fill:#ffffff;fill-opacity:1;${
        sanitised.length ? `${sanitised.join(";")}` : ""
      }"`;
    });
    return `<path${attrs} />`;
  });
}

fs.writeFileSync(svgPath, updated, "utf8");
console.log("Stamped chamber.svg with data-seat values.");

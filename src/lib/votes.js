import { canonicalMemberCode } from "./joins.js";

function buildStableVoteId(record) {
  const date = record?.date || "";
  const section = record?.section || "";
  const voteID = record?.voteID || "";
  const debateShowAs = record?.debateShowAs || "";

  return [date, section, voteID, debateShowAs].filter(Boolean).join("::");
}

export function normaliseVoteRecord(record) {
  if (!record?.tallies) {
    return {
      id: "",
      voteID: "",
      house: "",
      section: "",
      outcome: "",
      subject: "",
      debateShowAs: "",
      tellers: "",
      date: "",
      tallies: { Tá: 0, Níl: 0, Staon: 0 },
      byMemberCode: {},
    };
  }

  const byMemberCode = {};

  const groups = [
    ["Tá", record.tallies?.taVotes],
    ["Níl", record.tallies?.nilVotes],
    ["Staon", record.tallies?.staonVotes],
  ];

  for (const [label, group] of groups) {
    const members = group?.members || [];

    for (const item of members) {
      const memberCode = canonicalMemberCode(item?.member?.memberCode);
      if (!memberCode) continue;

      byMemberCode[memberCode] = {
        vote: label,
        memberCode,
        showAs: item?.member?.showAs || "",
        uri: item?.member?.uri || "",
      };
    }
  }

  return {
    id: buildStableVoteId(record),
    voteID: record.voteID || "",
    house: record.house || "",
    section: record.section || "",
    outcome: record.outcome || "",
    subject: record.subject || "",
    debateShowAs: record.debateShowAs || "",
    tellers: record.tellers || "",
    date: record.date || "",
    tallies: {
      Tá: record.tallies?.taVotes?.tally ?? 0,
      Níl: record.tallies?.nilVotes?.tally ?? 0,
      Staon: record.tallies?.staonVotes?.tally ?? 0,
    },
    byMemberCode,
  };
}

export function normaliseVotesDataset(votesJson) {
  const rows = Array.isArray(votesJson) ? votesJson : [votesJson];
  return rows.map(normaliseVoteRecord);
}

export const voteColorMap = {
  Tá: "#2e8b57",
  Níl: "#c0392b",
  Staon: "#84a1c4",
  Absent: "#d6d3d1",
};

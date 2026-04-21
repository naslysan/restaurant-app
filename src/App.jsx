import { useEffect, useMemo, useState } from "react";

const sampleSlotData = {
  "5:30": [2, 2, 2, 3, 8, 2, 4],
  "6:00": [2, 4, 6, 2, 4, 4, 3],
  "6:30": [2, 4, 4, 3, 3, 4, 4],
  "7:00": [4, 3, 4, 4, 4, 6],
};

const timeOrder = ["5:30", "6:00", "6:30", "7:00"];
const defaultInputs = Object.fromEntries(
  Object.entries(sampleSlotData).map(([time, values]) => [time, values.join(", ")]),
);

const initialFloorPlan = [
  { tableNumber: "12", seats: "4", section: "1", type: "standard", zone: "quiet" },
  { tableNumber: "22", seats: "4", section: "2", type: "standard", zone: "center" },
  { tableNumber: "31", seats: "4", section: "3", type: "booth", zone: "window" },
  { tableNumber: "35", seats: "4", section: "4", type: "booth", zone: "quiet" },
  { tableNumber: "42", seats: "6", section: "5", type: "standard", zone: "center" },
  { tableNumber: "1", seats: "4", section: "6", type: "standard", zone: "quiet" },
  { tableNumber: "2", seats: "4", section: "6", type: "standard", zone: "quiet" },
  { tableNumber: "44", seats: "6", section: "7", type: "standard", zone: "center" },
];

function buildSectionNames(numberOfSections) {
  return Array.from({ length: numberOfSections }, (_, index) => `Section ${index + 1}`);
}

function buildEmptyRows(numberOfSections) {
  return buildSectionNames(numberOfSections).map((sectionLabel, index) => ({
    section: sectionLabel,
    sectionNumber: String(index + 1),
    slots: Object.fromEntries(timeOrder.map((time) => [time, []])),
    total: 0,
  }));
}

function getRowTone(total, average) {
  const diff = Math.abs(total - average);
  if (diff <= 1) {
    return "row-balanced";
  }
  if (diff <= 3) {
    return "row-close";
  }
  return "row-off";
}

function parseReservationEntry(entry, time, index) {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }

  const requestedTableMatch = trimmed.match(/\b(?:table|t)\s*#?\s*([a-z0-9-]+)/i);
  const requestedTable = requestedTableMatch ? requestedTableMatch[1] : "";
  const textWithoutTable = requestedTableMatch ? trimmed.replace(requestedTableMatch[0], " ") : trimmed;
  const partyMatch = textWithoutTable.match(/\d+/);
  const partySize = partyMatch ? Number(partyMatch[0]) : NaN;

  if (!Number.isFinite(partySize) || partySize <= 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const needsBooth = /\bbooth\b/.test(normalized);
  const needsQuiet = /\bquiet\b/.test(normalized);
  const preferenceParts = [];

  if (requestedTable) {
    preferenceParts.push(`Table ${requestedTable}`);
  }
  if (needsBooth) {
    preferenceParts.push("Booth");
  }
  if (needsQuiet) {
    preferenceParts.push("Quiet");
  }

  return {
    id: `${time}-${index}`,
    time,
    partySize,
    requestedTable,
    needsBooth,
    needsQuiet,
    preference: preferenceParts.join(", ") || "None",
    preferencePriority: requestedTable ? 0 : needsBooth || needsQuiet ? 1 : 2,
    raw: trimmed,
  };
}

function buildReservationsByTime(slotInputs) {
  return Object.fromEntries(
    timeOrder.map((time) => {
      const reservations = (slotInputs[time] ?? "")
        .split(",")
        .map((entry, index) => parseReservationEntry(entry, time, index))
        .filter(Boolean);

      return [time, reservations];
    }),
  );
}

function normalizeFloorPlan(floorPlanRows) {
  return floorPlanRows
    .map((row) => ({
      tableNumber: row.tableNumber.trim(),
      seats: Number(row.seats),
      section: row.section.trim(),
      type: row.type,
      zone: row.zone,
    }))
    .filter((row) => row.tableNumber && Number.isFinite(row.seats) && row.seats > 0 && row.section);
}

function formatSlotReservations(reservations) {
  if (reservations.length === 0) {
    return "-";
  }

  return reservations.map((reservation) => reservation.partySize).join(" + ");
}

function compareReservationsForSectioning(a, b) {
  if (a.preferencePriority !== b.preferencePriority) {
    return a.preferencePriority - b.preferencePriority;
  }
  if (a.partySize !== b.partySize) {
    return b.partySize - a.partySize;
  }
  return a.id.localeCompare(b.id);
}

function compareReservationsForTables(a, b) {
  if (a.preferencePriority !== b.preferencePriority) {
    return a.preferencePriority - b.preferencePriority;
  }
  if (a.partySize !== b.partySize) {
    return b.partySize - a.partySize;
  }
  if (a.sectionNumber !== b.sectionNumber) {
    return a.sectionNumber.localeCompare(b.sectionNumber, undefined, { numeric: true });
  }
  return a.id.localeCompare(b.id);
}

function findPairOptions(tables, partySize) {
  const pairs = [];

  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tables.length; rightIndex += 1) {
      const pair = [tables[leftIndex], tables[rightIndex]];
      const totalSeats = pair[0].seats + pair[1].seats;
      if (totalSeats >= partySize) {
        pairs.push(pair);
      }
    }
  }

  return pairs;
}

function sectionSupportsReservation(sectionTables, reservation) {
  const requestedTable = reservation.requestedTable
    ? sectionTables.find((table) => table.tableNumber.toLowerCase() === reservation.requestedTable.toLowerCase())
    : null;

  if (reservation.requestedTable) {
    if (!requestedTable) {
      return false;
    }
    if (requestedTable.seats >= reservation.partySize) {
      return true;
    }
    return sectionTables.some(
      (table) => table.tableNumber !== requestedTable.tableNumber && requestedTable.seats + table.seats >= reservation.partySize,
    );
  }

  if (sectionTables.some((table) => table.seats >= reservation.partySize)) {
    return true;
  }

  return findPairOptions(sectionTables, reservation.partySize).length > 0;
}

function getSectionPreferenceFit(sectionTables, reservation) {
  if (reservation.requestedTable) {
    const table = sectionTables.find((item) => item.tableNumber.toLowerCase() === reservation.requestedTable.toLowerCase());
    return table ? 3 : 0;
  }

  let fit = 1;

  if (reservation.needsBooth) {
    fit += sectionTables.some((table) => table.type === "booth" && table.seats >= reservation.partySize) ? 1 : 0;
  }

  if (reservation.needsQuiet) {
    fit += sectionTables.some((table) => table.zone === "quiet" && table.seats >= reservation.partySize) ? 1 : 0;
  }

  return fit;
}

function chooseSectionForReservation(rows, reservation, tablesBySection) {
  const candidates = rows
    .map((row) => {
      const sectionTables = tablesBySection[row.sectionNumber] ?? [];
      const supportsReservation = sectionSupportsReservation(sectionTables, reservation);
      const preferenceFit = getSectionPreferenceFit(sectionTables, reservation);
      const slotReservations = row.slots[reservation.time] ?? [];

      return {
        row,
        supportsReservation,
        preferenceFit,
        slotCount: slotReservations.length,
      };
    })
    .filter((candidate) => {
      if (!reservation.requestedTable) {
        return true;
      }

      return candidate.preferenceFit > 0;
    })
    .sort((a, b) => {
      if (a.supportsReservation !== b.supportsReservation) {
        return Number(b.supportsReservation) - Number(a.supportsReservation);
      }
      if (a.preferenceFit !== b.preferenceFit) {
        return b.preferenceFit - a.preferenceFit;
      }
      if (a.slotCount !== b.slotCount) {
        return a.slotCount - b.slotCount;
      }
      if (a.row.total !== b.row.total) {
        return a.row.total - b.row.total;
      }
      return a.row.sectionNumber.localeCompare(b.row.sectionNumber, undefined, { numeric: true });
    });

  return candidates[0]?.row ?? null;
}

function assignReservationsToSections(numberOfSections, slotInputs, floorPlanRows) {
  const reservationsByTime = buildReservationsByTime(slotInputs);
  const rows = buildEmptyRows(numberOfSections);
  const validTables = normalizeFloorPlan(floorPlanRows).filter(
    (table) => Number(table.section) >= 1 && Number(table.section) <= numberOfSections,
  );
  const tablesBySection = validTables.reduce((accumulator, table) => {
    accumulator[table.section] = [...(accumulator[table.section] ?? []), table];
    return accumulator;
  }, {});

  timeOrder.forEach((time) => {
    const reservations = [...reservationsByTime[time]].sort(compareReservationsForSectioning);

    reservations.forEach((reservation) => {
      const targetRow = chooseSectionForReservation(rows, reservation, tablesBySection) ?? rows[0];
      targetRow.slots[time] = [...targetRow.slots[time], { ...reservation, sectionNumber: targetRow.sectionNumber }];
      targetRow.total += reservation.partySize;
    });
  });

  return rows.sort((a, b) => {
    if (a.total !== b.total) {
      return a.total - b.total;
    }
    return a.sectionNumber.localeCompare(b.sectionNumber, undefined, { numeric: true });
  });
}

function getAllocationPreferenceScore(reservation, tables) {
  let score = 0;

  if (reservation.requestedTable) {
    score += tables.some((table) => table.tableNumber.toLowerCase() === reservation.requestedTable.toLowerCase()) ? 8 : 0;
  }

  if (reservation.needsBooth) {
    score += tables.some((table) => table.type === "booth") ? 4 : 0;
  }

  if (reservation.needsQuiet) {
    score += tables.some((table) => table.zone === "quiet") ? 4 : 0;
  }

  return score;
}

function findBestTableAllocation(reservation, availableTables) {
  if (availableTables.length === 0) {
    return null;
  }

  const singleOptions = availableTables
    .filter((table) => table.seats >= reservation.partySize)
    .map((table) => ({
      tables: [table],
      seats: table.seats,
      preferenceScore: getAllocationPreferenceScore(reservation, [table]),
    }));

  const pairOptions = findPairOptions(availableTables, reservation.partySize).map((pair) => ({
    tables: pair,
    seats: pair[0].seats + pair[1].seats,
    preferenceScore: getAllocationPreferenceScore(reservation, pair),
  }));

  const requestedTableOnly = reservation.requestedTable
    ? [...singleOptions, ...pairOptions].filter((option) =>
        option.tables.some((table) => table.tableNumber.toLowerCase() === reservation.requestedTable.toLowerCase()),
      )
    : [];

  const prioritizedPool = reservation.requestedTable
    ? requestedTableOnly
    : reservation.preferencePriority < 2
      ? [...singleOptions, ...pairOptions].filter((option) => option.preferenceScore > 0)
      : [...singleOptions, ...pairOptions];

  const fallbackPool = reservation.requestedTable ? [] : [...singleOptions, ...pairOptions];
  const options = prioritizedPool.length > 0 ? prioritizedPool : fallbackPool;

  return options.sort((a, b) => {
    if (a.preferenceScore !== b.preferenceScore) {
      return b.preferenceScore - a.preferenceScore;
    }
    if (a.tables.length !== b.tables.length) {
      return a.tables.length - b.tables.length;
    }
    if (a.seats !== b.seats) {
      return a.seats - b.seats;
    }
    return a.tables
      .map((table) => table.tableNumber)
      .join("/")
      .localeCompare(
        b.tables.map((table) => table.tableNumber).join("/"),
        undefined,
        { numeric: true },
      );
  })[0] ?? null;
}

function assignTablesFromSections(sectionAssignments, floorPlanRows, numberOfSections) {
  const validTables = normalizeFloorPlan(floorPlanRows).filter(
    (table) => Number(table.section) >= 1 && Number(table.section) <= numberOfSections,
  );
  const results = [];

  timeOrder.forEach((time) => {
    const usedTables = new Set();
    const reservations = sectionAssignments
      .flatMap((row) => row.slots[time])
      .sort(compareReservationsForTables);

    reservations.forEach((reservation) => {
      const availableTables = validTables.filter(
        (table) => table.section === reservation.sectionNumber && !usedTables.has(table.tableNumber),
      );
      const allocation = findBestTableAllocation(reservation, availableTables);

      if (!allocation) {
        results.push({
          section: reservation.sectionNumber,
          time,
          party: reservation.partySize,
          preference: reservation.preference,
          table: "Unassigned",
        });
        return;
      }

      allocation.tables.forEach((table) => usedTables.add(table.tableNumber));

      results.push({
        section: reservation.sectionNumber,
        time,
        party: reservation.partySize,
        preference: reservation.preference,
        table: allocation.tables.map((table) => table.tableNumber).join(" + "),
      });
    });
  });

  return results.sort((a, b) => {
    if (a.section !== b.section) {
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    }
    if (a.time !== b.time) {
      return timeOrder.indexOf(a.time) - timeOrder.indexOf(b.time);
    }
    if (a.party !== b.party) {
      return b.party - a.party;
    }
    return a.table.localeCompare(b.table, undefined, { numeric: true });
  });
}

function App() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [sections, setSections] = useState(7);
  const [floorPlanRows, setFloorPlanRows] = useState(initialFloorPlan);
  const [assignments, setAssignments] = useState(() => assignReservationsToSections(7, defaultInputs, initialFloorPlan));
  const [tableAssignments, setTableAssignments] = useState(() =>
    assignTablesFromSections(assignReservationsToSections(7, defaultInputs, initialFloorPlan), initialFloorPlan, 7),
  );

  function rebuild(nextSectionCount = sections, nextInputs = inputs, nextFloorPlanRows = floorPlanRows) {
    const nextAssignments = assignReservationsToSections(nextSectionCount, nextInputs, nextFloorPlanRows);
    setAssignments(nextAssignments);
    setTableAssignments(assignTablesFromSections(nextAssignments, nextFloorPlanRows, nextSectionCount));
  }

  function updateFloorPlanRow(index, field, value) {
    setFloorPlanRows((current) => {
      const nextRows = current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
      rebuild(sections, inputs, nextRows);
      return nextRows;
    });
  }

  function handleChange(time, value) {
    const updated = { ...inputs, [time]: value };
    setInputs(updated);
    localStorage.setItem("inputs", JSON.stringify(updated));
    rebuild(sections, updated, floorPlanRows);
  }

  useEffect(() => {
    const savedInputs = localStorage.getItem("inputs");
    const savedSections = localStorage.getItem("sections");

    const nextInputs = savedInputs ? JSON.parse(savedInputs) : defaultInputs;
    const nextSections = savedSections ? JSON.parse(savedSections) : 7;

    setInputs(nextInputs);
    setSections(nextSections);
    rebuild(nextSections, nextInputs, initialFloorPlan);
  }, []);

  const stats = useMemo(() => {
    const grandTotal = assignments.reduce((sum, row) => sum + row.total, 0);
    return {
      grandTotal,
      average: assignments.length > 0 ? grandTotal / assignments.length : 0,
    };
  }, [assignments]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Restaurant Seating</p>
          <h1>Host Assignment Flow</h1>
          <p className="hero-copy">
            Parse reservations from each time slot, balance them across sections, then assign tables by floor plan and guest preference.
          </p>
        </div>
      </header>

      <main className="panel">
        <section className="editor-block">
          <div className="section-header">
            <h2>Floor Plan</h2>
          </div>
          <div className="table-wrap">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>Table #</th>
                  <th>Seats</th>
                  <th>Section (1-7)</th>
                  <th>Type</th>
                  <th>Zone</th>
                </tr>
              </thead>
              <tbody>
                {floorPlanRows.map((row, index) => (
                  <tr key={`${row.tableNumber}-${index}`}>
                    <td>
                      <input
                        type="text"
                        value={row.tableNumber}
                        onChange={(event) => updateFloorPlanRow(index, "tableNumber", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.seats}
                        onChange={(event) => updateFloorPlanRow(index, "seats", event.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={row.section}
                        onChange={(event) => updateFloorPlanRow(index, "section", event.target.value)}
                      >
                        {Array.from({ length: 7 }, (_, sectionIndex) => String(sectionIndex + 1)).map((section) => (
                          <option key={section} value={section}>
                            {section}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.type}
                        onChange={(event) => updateFloorPlanRow(index, "type", event.target.value)}
                      >
                        <option value="booth">booth</option>
                        <option value="standard">standard</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.zone}
                        onChange={(event) => updateFloorPlanRow(index, "zone", event.target.value)}
                      >
                        <option value="quiet">quiet</option>
                        <option value="center">center</option>
                        <option value="window">window</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="editor-block">
          <div className="section-header">
            <h2>Reservations</h2>
          </div>
          <div className="slot-input-grid">
            {timeOrder.map((time) => (
              <label key={time} className="control-group slot-input-group" htmlFor={`slot-${time}`}>
                <span>{time}</span>
                <input
                  id={`slot-${time}`}
                  type="text"
                  value={inputs[time]}
                  placeholder="e.g. 4 booth, 2 quiet, 6 table 42"
                  onChange={(event) => handleChange(time, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="input-help">
            Enter comma-separated reservations. Start with party size, then add optional preferences like <code>booth</code>, <code>quiet</code>, or <code>table 35</code>.
          </p>
          <div className="control-row">
            <label className="control-group" htmlFor="sections">
              <span>Sections</span>
              <select
                id="sections"
                value={String(sections)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSections(value);
                  localStorage.setItem("sections", JSON.stringify(value));
                  rebuild(value, inputs, floorPlanRows);
                }}
              >
                <option value="6">6</option>
                <option value="7">7</option>
              </select>
            </label>
          </div>

          <div className="table-wrap assignment-results">
            <table className="load-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Time</th>
                  <th>Party</th>
                  <th>Preference</th>
                  <th>Table</th>
                </tr>
              </thead>
              <tbody>
                {tableAssignments.map((assignment, index) => (
                  <tr key={`${assignment.section}-${assignment.time}-${assignment.party}-${assignment.table}-${index}`}>
                    <td>{assignment.section}</td>
                    <td>{assignment.time}</td>
                    <td>{assignment.party}</td>
                    <td>{assignment.preference}</td>
                    <td>{assignment.table}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="summary-bar">
          <div className="summary-card">
            <span>Total Guests</span>
            <strong>{stats.grandTotal}</strong>
          </div>
          <div className="summary-card">
            <span>Average Per Section</span>
            <strong>{stats.average.toFixed(1)}</strong>
          </div>
        </div>

        <div className="table-wrap">
          <table className="load-table">
            <thead>
              <tr>
                <th>Section</th>
                {timeOrder.map((time) => (
                  <th key={time}>{time}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => (
                <tr key={row.section} className={getRowTone(row.total, stats.average)}>
                  <td className="section-name">{row.section}</td>
                  {timeOrder.map((time) => (
                    <td key={`${row.section}-${time}`}>{formatSlotReservations(row.slots[time])}</td>
                  ))}
                  <td className="total-cell">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="legend">
          <div className="legend-item"><span className="legend-swatch row-balanced"></span>Green = balanced</div>
          <div className="legend-item"><span className="legend-swatch row-close"></span>Yellow = slightly off</div>
          <div className="legend-item"><span className="legend-swatch row-off"></span>Red = unbalanced</div>
        </div>
      </main>
    </div>
  );
}

export default App;

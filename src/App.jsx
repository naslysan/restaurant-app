import { useMemo, useState } from "react";

const slotData = {
  "5:30": [2, 2, 2, 3, 8, 2, 4],
  "6:00": [2, 4, 6, 2, 4, 4, 3],
  "6:30": [2, 4, 4, 3, 3, 4, 4],
  "7:00": [4, 3, 4, 4, 4, 6],
};

const timeOrder = Object.keys(slotData);
const initialSlotInputs = Object.fromEntries(
  timeOrder.map((time) => [time, slotData[time].join(",")]),
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
  return buildSectionNames(numberOfSections).map((section) => ({
    section,
    slots: Object.fromEntries(timeOrder.map((time) => [time, null])),
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

function parseSlotInput(value) {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function buildSlotData(slotInputs) {
  return Object.fromEntries(
    timeOrder.map((time) => [time, parseSlotInput(slotInputs[time] ?? "")]),
  );
}

function balanceLoad(numberOfSections, activeSlotData) {
  const rows = buildEmptyRows(numberOfSections);

  timeOrder.forEach((time) => {
    const values = [...activeSlotData[time]].sort((a, b) => b - a);
    values.forEach((value) => {
      const target = [...rows].sort((a, b) => {
        const aCount = a.slots[time] === null ? 0 : Array.isArray(a.slots[time]) ? a.slots[time].length : 1;
        const bCount = b.slots[time] === null ? 0 : Array.isArray(b.slots[time]) ? b.slots[time].length : 1;

        if (aCount !== bCount) {
          return aCount - bCount;
        }

        if (a.total !== b.total) {
          return a.total - b.total;
        }

        return a.section.localeCompare(b.section);
      })[0];

      if (target.slots[time] === null) {
        target.slots[time] = value;
      } else if (Array.isArray(target.slots[time])) {
        target.slots[time] = [...target.slots[time], value];
      } else {
        target.slots[time] = [target.slots[time], value];
      }

      target.total += value;
    });
  });

  return [...rows].sort((a, b) => {
    if (a.total !== b.total) {
      return a.total - b.total;
    }
    return a.section.localeCompare(b.section);
  });
}

function App() {
  const [numberOfSections, setNumberOfSections] = useState(7);
  const [slotInputs, setSlotInputs] = useState(initialSlotInputs);
  const [floorPlanRows, setFloorPlanRows] = useState(initialFloorPlan);
  const [assignments, setAssignments] = useState(() => balanceLoad(7, slotData));

  function rebalance(nextSectionCount) {
    setAssignments(balanceLoad(nextSectionCount, buildSlotData(slotInputs)));
  }

  function updateFloorPlanRow(index, field, value) {
    setFloorPlanRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  const stats = useMemo(() => {
    const grandTotal = assignments.reduce((sum, row) => sum + row.total, 0);
    return {
      grandTotal,
      average: grandTotal / assignments.length,
    };
  }, [assignments]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Restaurant Seating</p>
          <h1>Load Balancer</h1>
          <p className="hero-copy">
            Balance guest counts across the 5:30, 6:00, 6:30, and 7:00 waves.
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
            <h2>Guest Waves</h2>
          </div>
          <div className="slot-input-grid">
            {timeOrder.map((time) => (
              <label key={time} className="control-group slot-input-group" htmlFor={`slot-${time}`}>
                <span>{time}</span>
                <input
                  id={`slot-${time}`}
                  type="text"
                  value={slotInputs[time]}
                  placeholder="e.g. 2,2,4,3"
                  onChange={(event) =>
                    setSlotInputs((current) => ({
                      ...current,
                      [time]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="control-row">
            <label className="control-group" htmlFor="sections">
              <span>Sections</span>
              <select
                id="sections"
                value={String(numberOfSections)}
                onChange={(event) => {
                  const nextSectionCount = Number(event.target.value);
                  setNumberOfSections(nextSectionCount);
                  rebalance(nextSectionCount);
                }}
              >
                <option value="6">6</option>
                <option value="7">7</option>
              </select>
            </label>
            <button className="action-button" type="button" onClick={() => rebalance(numberOfSections)}>
              Balance Load
            </button>
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
                    <td key={`${row.section}-${time}`}>
                      {row.slots[time] === null
                        ? "-"
                        : Array.isArray(row.slots[time])
                          ? row.slots[time].join(" + ")
                          : row.slots[time]}
                    </td>
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

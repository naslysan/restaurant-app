import { useMemo, useState } from "react";

const slotData = {
  "5:30": [2, 2, 2, 3, 8, 2, 4],
  "6:00": [2, 4, 6, 2, 4, 4, 3],
  "6:30": [2, 4, 4, 3, 3, 4, 4],
  "7:00": [4, 3, 4, 4, 4, 6],
};

const timeOrder = Object.keys(slotData);

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

function balanceLoad(numberOfSections) {
  const rows = buildEmptyRows(numberOfSections);

  timeOrder.forEach((time) => {
    const values = [...slotData[time]].sort((a, b) => b - a);
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
  const [assignments, setAssignments] = useState(() => balanceLoad(7));

  function rebalance(nextSectionCount) {
    setAssignments(balanceLoad(nextSectionCount));
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
        <div className="hero-actions">
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
      </header>

      <main className="panel">
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

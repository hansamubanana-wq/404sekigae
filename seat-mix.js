"use strict";

const SEAT_SHUFFLE_LIMIT = 4096;
const SEAT_CLUSTER_LIMIT = 12;  // 完全ランダムで測った最大の塊の平均は約12.9人

// Pre-filter each half where all neighbors are in that half. The two rows
// touching the split are checked after combining the halves.
function buildSeatMix(positions, neighbors, indexByKey) {
  const split = Math.floor(rows / 2);
  const halves = [{ mask: 0, checked: 0, twoNeighbors: 0 }, { mask: 0, checked: 0, twoNeighbors: 0 }];
  const cells = positions.map((key, index) => {
    const [row, col] = key.split("-").map(Number);
    const half = Number(row >= split);
    const bit = 1 << ((half ? row - split : row) * cols + col);
    const info = halves[half];
    info.mask |= bit;
    if (row !== split - 1 && row !== split && neighbors[index].length) {
      info.checked |= bit;
      if (neighbors[index].length > 1) info.twoNeighbors |= bit;
    }
    return { half, bit };
  });

  let leftColumn = 0, rightColumn = 0;
  for (let row = 0; row < Math.ceil(rows / 2); row++) {
    leftColumn |= 1 << (row * cols);
    rightColumn |= 1 << (row * cols + cols - 1);
  }
  const adjacent = bits => (bits << cols) | (bits >>> cols) |
    ((bits & ~rightColumn) << 1) | ((bits & ~leftColumn) >>> 1);

  for (const half of halves) {
    half.byCount = Array.from({ length: positions.length + 1 }, () => []);
    for (let boys = half.mask; ; boys = (boys - 1) & half.mask) {
      const girls = half.mask ^ boys;
      const boyNeighbors = adjacent(boys), girlNeighbors = adjacent(girls);
      const same = (boys & boyNeighbors) | (girls & girlNeighbors);
      const other = (boys & girlNeighbors) | (girls & boyNeighbors);
      if (!(half.checked & ~same) && !(half.twoNeighbors & ~other)) {
        let count = 0;
        for (let bits = boys; bits; bits &= bits - 1) count++;
        half.byCount[count].push(boys);
      }
      if (boys === 0) break;
    }
  }
  return { cells, halves, indexByKey };
}

function scoreSeatMix(genders, neighbors, seen, queue) {
  let violations = 0;
  let largest = 0;
  seen.fill(0);
  for (let i = 0; i < genders.length; i++) {
    const adjacent = neighbors[i], gender = genders[i];
    let same = 0;
    for (const neighbor of adjacent) if (genders[neighbor] === gender) same++;
    if ((adjacent.length && !same) || (adjacent.length > 1 && same === adjacent.length)) violations++;

    if (seen[i]) continue;
    seen[i] = 1;
    queue[0] = i;
    let size = 1;
    for (let head = 0; head < size; head++) {
      for (const neighbor of neighbors[queue[head]]) {
        if (seen[neighbor] || genders[neighbor] !== gender) continue;
        seen[neighbor] = 1;
        queue[size++] = neighbor;
      }
    }
    if (size > largest) largest = size;
  }
  return { violations, largest };
}

function chooseSeatMix(layout, movable, positions, neighbors, mix, reserved) {
  const { random, floor } = Math;
  const indices = movable.map(key => mix.indexByKey.get(key));
  const allowed = reserved?.seats.map(key => mix.indexByKey.get(key));
  const reservedGender = reserved?.student.gender === "boy" ? 1 : 0;
  const open = new Set(indices);
  const genders = new Uint8Array(positions.length);
  const seen = new Uint8Array(positions.length);
  const queue = new Int16Array(positions.length);
  const initial = positions.map(key => layout[key]);
  const fixed = [0, 0], fixedBoys = [0, 0];
  let numBoys = 0;
  initial.forEach((student, i) => {
    const boy = student.gender === "boy";
    genders[i] = boy ? 1 : 0;
    numBoys += genders[i];
    if (!open.has(i)) {
      const { half, bit } = mix.cells[i];
      fixed[half] |= bit;
      if (boy) fixedBoys[half] |= bit;
    }
  });
  const options = mix.halves.map(({ byCount }, half) =>
    fixed[half] ? byCount.map(bucket => bucket.filter(mask => (mask & fixed[half]) === fixedBoys[half])) : byCount);
  const choices = [];
  let total = 0;
  for (let n = 0; n <= numBoys; n++) {
    const top = options[0][n], bottom = options[1][numBoys - n];
    if (!top.length || !bottom.length) continue;
    total += top.length * bottom.length;
    choices.push({ top, bottom, end: total });
  }

  let best, bestScore = Infinity, bestResult, bestReserved = -1, accepted = false;
  const bothGenders = indices.some(i => genders[i] !== genders[indices[0]]);
  const budget = bothGenders ? SEAT_SHUFFLE_LIMIT : 1;
  for (let step = 0; step < budget; step++) {
    // During the last quarter, include unrestricted proposals so the fallback
    // can also find smaller clusters that break a rule inside either half.
    if (bothGenders && total && step < budget * .75) {
      const pick = random() * total;
      const { top, bottom } = choices.find(choice => pick < choice.end);
      const first = top[floor(random() * top.length)], last = bottom[floor(random() * bottom.length)];
      for (const i of indices) {
        const { half, bit } = mix.cells[i];
        genders[i] = ((half ? last : first) & bit) ? 1 : 0;
      }
    } else if (bothGenders) {
      for (let i = indices.length - 1; i > 0; i--) {
        const a = indices[i], b = indices[floor(random() * (i + 1))];
        const gender = genders[a];
        genders[a] = genders[b];
        genders[b] = gender;
      }
    }
    // Drawing the seat independently keeps all eligible seating assignments equally likely.
    const seat = allowed ? allowed[floor(random() * allowed.length)] : -1;
    if (seat >= 0 && genders[seat] !== reservedGender) {
      if (step < budget - 1 || best) continue;
      // Guarantee a rear seat even if every sampled layout lacked a matching draw.
      const swap = indices.find(i => genders[i] === reservedGender);
      genders[swap] = genders[seat];
      genders[seat] = reservedGender;
    }
    const result = scoreSeatMix(genders, neighbors, seen, queue);
    if (!result.violations && result.largest <= SEAT_CLUSTER_LIMIT) {
      best = genders;
      bestReserved = seat;
      accepted = true;
      break;
    }
    const score = result.violations + result.largest;
    if (score < bestScore) {
      bestScore = score;
      bestResult = result;
      best = genders.slice();
      bestReserved = seat;
    }
  }
  if (!accepted) {
    console.warn(`男女の隣席条件を満たす配置が見つかりませんでした（${budget}回）。試した中で違反人数と最大の同性の塊の合計が最少の配置を採用します（違反${bestResult.violations}人、最大${bestResult.largest}人）。`);
  }

  const byGender = [[], []];
  for (const key of movable) {
    const student = layout[key];
    if (student === reserved?.student) continue;
    byGender[Number(student.gender === "boy")].push(student);
  }
  const girls = shuffleArray(byGender[0]), boys = shuffleArray(byGender[1]);
  return indices.map(i => i === bestReserved ? reserved.student : (best[i] ? boys : girls).pop());
}

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

const IDENTITY = {
  user_id: "abhinav_11112004",
  email_id: "aj4350@srmist.edu.in",
  college_roll_number: "RA2311056030185",
};

const EDGE_PATTERN = /^([A-Z])->([A-Z])$/;

function parseEdge(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(EDGE_PATTERN);
  if (!match) return { valid: false, raw: trimmed };
  const [, from, to] = match;
  if (from === to) return { valid: false, raw: trimmed };
  return { valid: true, raw: trimmed, from, to };
}

function buildGraph(edgeList) {
  const children = {};
  const parentOf = {};
  const seenEdges = new Set();
  const duplicateSet = new Set();
  const allNodes = new Set();
  const allEdgePairs = [];

  for (const { from, to } of edgeList) {
    const key = `${from}->${to}`;

    if (seenEdges.has(key)) {
      duplicateSet.add(key);
      continue;
    }
    seenEdges.add(key);

    allNodes.add(from);
    allNodes.add(to);
    allEdgePairs.push({ from, to });

    if (parentOf[to] !== undefined) continue;

    parentOf[to] = from;
    if (!children[from]) children[from] = [];
    children[from].push(to);
  }

  for (const node of allNodes) {
    if (!children[node]) children[node] = [];
  }

  return { children, parentOf, allNodes, allEdgePairs, duplicateEdges: [...duplicateSet] };
}

function findComponents(allNodes, allEdgePairs) {
  const visited = new Set();
  const components = [];

  const undirected = {};
  for (const node of allNodes) undirected[node] = new Set();
  for (const { from, to } of allEdgePairs) {
    undirected[from].add(to);
    undirected[to].add(from);
  }

  for (const node of [...allNodes].sort()) {
    if (visited.has(node)) continue;
    const group = [];
    const queue = [node];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      group.push(cur);
      for (const neighbor of undirected[cur]) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(new Set(group));
  }

  return components;
}

function hasCycle(nodeSet, children) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  for (const n of nodeSet) color[n] = WHITE;

  function dfs(node) {
    color[node] = GRAY;
    for (const child of (children[node] || [])) {
      if (!nodeSet.has(child)) continue;
      if (color[child] === GRAY) return true;
      if (color[child] === WHITE && dfs(child)) return true;
    }
    color[node] = BLACK;
    return false;
  }

  for (const n of nodeSet) {
    if (color[n] === WHITE && dfs(n)) return true;
  }
  return false;
}

function buildTreeObject(node, children, nodeSet) {
  const kids = (children[node] || []).filter(k => nodeSet.has(k)).sort();
  if (kids.length === 0) return {};
  const result = {};
  for (const kid of kids) {
    result[kid] = buildTreeObject(kid, children, nodeSet);
  }
  return result;
}

function computeDepth(node, children, nodeSet) {
  const kids = (children[node] || []).filter(k => nodeSet.has(k));
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map(k => computeDepth(k, children, nodeSet)));
}

function processComponent(nodeSet, children, parentOf) {
  const cyclic = hasCycle(nodeSet, children);

  const naturalRoots = [...nodeSet]
    .filter(n => !parentOf[n] || !nodeSet.has(parentOf[n]))
    .sort();

  let root;
  if (naturalRoots.length > 0) {
    root = naturalRoots[0];
  } else {
    root = [...nodeSet].sort()[0];
  }

  if (cyclic) {
    return { root, tree: {}, has_cycle: true };
  }

  const tree = buildTreeObject(root, children, nodeSet);
  const depth = computeDepth(root, children, nodeSet);

  return { root, tree, depth, has_cycle: false };
}

app.post("/bfhl", (req, res) => {
  const input = req.body;

  const rawEntries = Array.isArray(input)
    ? input
    : Array.isArray(input?.edges)
    ? input.edges
    : null;

  if (!rawEntries) {
    return res.status(400).json({
      error: 'Request body must be an array or an object with an "edges" array.',
    });
  }

  const validEdges = [];
  const invalidEntries = [];

  for (const entry of rawEntries) {
    if (typeof entry !== "string") {
      invalidEntries.push(String(entry));
      continue;
    }
    const parsed = parseEdge(entry);
    if (parsed.valid) {
      validEdges.push(parsed);
    } else {
      invalidEntries.push(parsed.raw);
    }
  }

  const { children, parentOf, allNodes, allEdgePairs, duplicateEdges } = buildGraph(validEdges);

  const components = allNodes.size > 0 ? findComponents(allNodes, allEdgePairs) : [];

  const hierarchies = components.map(nodeSet =>
    processComponent(nodeSet, children, parentOf)
  );

  hierarchies.sort((a, b) => a.root.localeCompare(b.root));

  const totalTrees = hierarchies.length;
  const totalCycles = hierarchies.filter(h => h.has_cycle).length;

  let largestTreeRoot = null;
  if (hierarchies.length > 0) {
    const nonCyclic = hierarchies.filter(h => !h.has_cycle);
    if (nonCyclic.length > 0) {
      const countNodes = h => {
        let count = 0;
        const seen = new Set();
        const queue = [h.root];
        while (queue.length) {
          const n = queue.shift();
          if (seen.has(n)) continue;
          seen.add(n);
          count++;
          for (const kid of (children[n] || [])) queue.push(kid);
        }
        return count;
      };

      let best = nonCyclic[0];
      for (const h of nonCyclic.slice(1)) {
        const hCount = countNodes(h);
        const bestCount = countNodes(best);
        if (hCount > bestCount || (hCount === bestCount && h.root < best.root)) {
          best = h;
        }
      }
      largestTreeRoot = best.root;
    }
  }

  const summary = {
    total_trees: totalTrees,
    total_cycles: totalCycles,
    largest_tree_root: largestTreeRoot,
  };

  return res.json({
    ...IDENTITY,
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary,
  });
});

app.get("/bfhl", (_req, res) => {
  res.json({ operation_code: 1 });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

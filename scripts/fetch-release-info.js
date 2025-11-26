//latest db updated rows
import { execSync } from "child_process";
import pg from "pg";

const { Pool } = pg;

// ---------------------
// 🧱 PostgreSQL Setup
// ---------------------
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.on("connect", () => console.log("✅ Database connected successfully!"));
pool.on("error", (err) =>
  console.error("❌ Unexpected database error:", err.message)
);

// ---------------------
// 🔍 Utility Functions
// ---------------------

function getRepoName() {
  try {
    const repoUrl = execSync("git config --get remote.origin.url")
      .toString()
      .trim();
    const match = repoUrl.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (!match) throw new Error("Could not extract repo name from remote URL");
    return match[1];
  } catch {
    return "unknown-repo";
  }
}

function extractAllTicketsFromCommitMessage(commitMessage) {
  if (!commitMessage) return [];
  try {
    const matches = commitMessage.match(/\b[A-Z]+-\d+\b/gi);
    return matches ? [...new Set(matches.map((t) => t.toUpperCase()))] : [];
  } catch (error) {
    console.error("❌ Error extracting tickets:", error.message);
    return [];
  }
}

function fetchLocalCommitData() {
  try {
    const sha = execSync("git rev-parse HEAD").toString().trim();
    const author = execSync(`git log -1 --format=%an ${sha}`).toString().trim();
    const email = execSync(`git log -1 --format=%ae ${sha}`).toString().trim();
    const date = execSync(`git log -1 --format=%aI ${sha}`).toString().trim();
    const message = execSync(`git log -1 --format=%B ${sha}`)
      .toString()
      .trim();

    const tickets = extractAllTicketsFromCommitMessage(message);
    const ticketString = tickets.length > 0 ? tickets.join(", ") : "N/A";

    return {
      sha,
      author,
      email,
      date,
      message,
      tickets,
      ticketString,
      repo: process.env.PROJECT_NAME || getRepoName(),
    };
  } catch (error) {
    console.error("❌ Error fetching commit data:", error.message);
    return null;
  }
}

function getGitTagInfo() {
  try {
    const tag = execSync("git describe --tags --abbrev=0").toString().trim();
    const releaseDate = execSync(`git log -1 --format=%aI ${tag}`)
      .toString()
      .trim();
    return { tag, releaseDate };
  } catch (error) {
    console.error("⚠️ No Git tag found:", error.message);
    return { tag: null, releaseDate: null };
  }
}

// ---------------------
// 🧩 Main Store Function
// ---------------------

async function storeGitTagAndJiraIssues() {
  const environment = process.env.ENVIRONMENT || "dev";
  const { tag, releaseDate } = getGitTagInfo();

  if (!tag || !releaseDate) {
    console.log("⚠️ No tag or release date found — skipping DB insert.");
    await pool.end();
    return;
  }

  try {
    const commitData = fetchLocalCommitData();
    console.log(`🎫 Tickets Found: ${commitData?.ticketString || "N/A"}`);

    // Ensure table exists + add unique constraint
    console.log("🧱 Ensuring table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dora_release_info (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) NOT NULL,
        ticket TEXT NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        project_name VARCHAR(100),
        environment VARCHAR(20),
        inserted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tag, environment, ticket)
      );
    `);

    console.log("💾 Inserting/Updating release info...");

    const insertQuery = `
      INSERT INTO dora_release_info (tag, ticket, release_date, project_name, environment)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tag, environment, ticket)
      DO UPDATE SET 
        release_date = EXCLUDED.release_date,
        project_name = EXCLUDED.project_name;
    `;

    await pool.query(insertQuery, [
      tag,
      commitData?.ticketString || "N/A",
      releaseDate,
      commitData?.repo || "unknown",
      environment,
    ]);

    console.log("✨ Inserted or updated release info for:", tag);

  } catch (err) {
    console.error("❌ Error storing release data:", err.message);
  } finally {
    console.log("🔌 Closing DB connection...");
    await pool.end();
    console.log("👋 Done.");
    process.exit(0);
  }
}

// 🚀 Execute function
storeGitTagAndJiraIssues();

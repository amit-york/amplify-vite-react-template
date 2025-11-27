// 

//latest script
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

function getLatestCommitMessage() {
  try {
    return execSync("git log -1 --format=%B").toString().trim();
  } catch {
    return "";
  }
}

// ---------------------
// 🧩 Main Store Function
// ---------------------

async function storeGitTagAndJiraIssues() {
  const environment = process.env.ENVIRONMENT || "dev";
  const { tag, releaseDate } = getGitTagInfo();

  try {
    const commitMessage = getLatestCommitMessage();
    const tickets = extractAllTicketsFromCommitMessage(commitMessage);
    const ticketString = tickets.length > 0 ? tickets.join(", ") : "N/A";

    const effectiveTag =
      tag || process.env.FALLBACK_TAG || "no-tag";

    const effectiveReleaseDate =
      releaseDate || new Date().toISOString();

    console.log(`🏷️ Tag: ${effectiveTag}`);
    console.log(`📅 Release Date: ${effectiveReleaseDate}`);
    console.log(`🎫 Tickets: ${ticketString}`);

    // Create table without commit-related fields
    console.log("🧱 Ensuring table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dora_release_info (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(100) NOT NULL,
        ticket TEXT NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        project_name VARCHAR(255),
        environment VARCHAR(50),
        inserted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tag, environment, ticket)
      );
    `);

    console.log("💾 Inserting / Updating...");

    const insertQuery = `
      INSERT INTO dora_release_info (
        tag,
        ticket,
        release_date,
        project_name,
        environment
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tag, environment, ticket)
      DO UPDATE SET 
        release_date = EXCLUDED.release_date,
        project_name = EXCLUDED.project_name;
    `;

    await pool.query(insertQuery, [
      effectiveTag,
      ticketString,
      effectiveReleaseDate,
      getRepoName(),
      environment,
    ]);

    console.log("✨ Saved release info:", effectiveTag);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    console.log("🔌 Closing connection...");
    await pool.end();
    process.exit(0);
  }
}

// 🚀 Execute function
storeGitTagAndJiraIssues();

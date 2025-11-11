import { execSync } from "child_process";
import pg from "pg";
import fetch from "node-fetch";


const { Pool } = pg;

// Initialize PostgreSQL connection
const pool = new Pool({
  host: "3.108.9.100",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "dorametrics",
});

pool.on("connect", () => console.log("✅ Database connected successfully!"));
pool.on("error", (err) => console.error("❌ Unexpected database error:", err.message));


/**
   * Automatically get repo name (owner/repo) from git remote URL.
   */
function getRepoName() {
  const repoUrl = execSync("git config --get remote.origin.url").toString().trim();
  const match = repoUrl.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!match) throw new Error("❌ Could not extract repo name from remote URL");
  return match[1];
}

/**
 * Get the latest commit SHA.
 */
function getLatestCommitSHA() {
  return execSync("git rev-parse HEAD").toString().trim();
}

/**
 * Extract ticket from commit message.
 * Expected format: "ticket ENG-212: description" or similar
 */
function extractTicketFromCommitMessage(commitMessage) {
  if (!commitMessage) return null;
  
  try {
    // Extract ticket from commit message (e.g., "ticket eng-212: description" -> "eng-212")
    const parts = commitMessage.split(":")[0].trim().split(" ");
    const ticketIndex = parts.findIndex(part => 
      part.toLowerCase().includes("ticket") || 
      part.toLowerCase().includes("eng-") ||
      /^[A-Z]+-\d+$/i.test(part)
    );
    
    if (ticketIndex !== -1) {
      // If "ticket" keyword found, get the next part
      if (parts[ticketIndex].toLowerCase() === "ticket" && parts[ticketIndex + 1]) {
        return parts[ticketIndex + 1].trim().toUpperCase();
      }
      // If ticket format found directly (e.g., "ENG-212")
      if (/^[A-Z]+-\d+$/i.test(parts[ticketIndex])) {
        return parts[ticketIndex].trim().toUpperCase();
      }
    }
    
    // Fallback: try to find any pattern like ENG-XXX in the first line
    const firstLine = commitMessage.split("\n")[0];
    const ticketMatch = firstLine.match(/([A-Z]+-\d+)/i);
    if (ticketMatch) {
      return ticketMatch[1].toUpperCase();
    }
    
    return null;
  } catch (error) {
    console.error("❌ Error extracting ticket from commit message:", error.message);
    return null;
  }
}

/**
 * Fetch commit details from GitHub using SHA hash.
 */
async function fetchGitHubData() {
  const repo = getRepoName();
  const sha = getLatestCommitSHA();
  // Uncomment and set a specific SHA for testing:
  // const sha = "792ba18ad7ee6295c59def7773fb02ac44165d9d";

  console.log(`🔍 Repo: ${repo}`);
  console.log(`💾 Commit SHA: ${sha}\n`);

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("❌ Missing GITHUB_TOKEN in environment variables. Please set GITHUB_TOKEN environment variable.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Fetch latest commit details
  // Note: repo already contains "owner/repo" format from getRepoName()
  const apiUrl = `https://api.github.com/repos/${repo}/commits/${sha}`;
  console.log(`📡 Fetching: ${apiUrl}`);
  
  const commitRes = await fetch(apiUrl, { headers });
  
  // Check if the request was successful
  if (!commitRes.ok) {
    const errorData = await commitRes.json().catch(() => ({}));
    throw new Error(
      `❌ GitHub API Error (${commitRes.status}): ${errorData.message || commitRes.statusText}\n` +
      `   URL: ${apiUrl}\n` +
      `   Check if the repo exists and the SHA is valid.`
    );
  }
  
  const commitData = await commitRes.json();
  
  const commitMessage = commitData.commit?.message || "";
  const ticket = extractTicketFromCommitMessage(commitMessage);

  const commitInfo = {
    sha: commitData.sha,
    author: commitData.commit?.author.name,
    email: commitData.commit?.author.email,
    date: commitData.commit?.author.date,
    message: commitMessage,
    url: commitData.html_url,
    ticket: ticket,
  };

  console.log("✅ Latest Commit Details:");
  console.log(commitInfo);
  
  if (!ticket) {
    console.log("\n⚠️ No ticket found in commit message.");
  }

  return commitInfo;
}
/**
 * Fetch latest Git tag and release date.
 */
function getGitTagInfo() {
  try {
    console.log("🔍 Fetching latest Git tag info...");
    const tag = execSync("git describe --tags --abbrev=0").toString().trim();
    const releaseDate = execSync(`git log -1 --format=%aI ${tag}`).toString().trim();
    console.log(`🏷️ Latest tag: ${tag}, released on: ${releaseDate}`);
    return { tag, releaseDate };
  } catch (error) {
    console.error("❌ Error fetching Git tag info:", error.message);
    return { tag: null, releaseDate: null };
  }
}



/**
 * Store Git tag and Jira issues in DB.
 */
async function storeGitTagAndJiraIssues() {
  const { tag, releaseDate } = getGitTagInfo();
  if (!tag || !releaseDate) {
    console.log("⚠️ No tag or release date found — skipping DB insert.");
    await pool.end();
    return;
  }

  try {
    const commitData = await fetchGitHubData();
    console.log(`🎫 Extracted ticket: ${commitData?.ticket || "N/A"}`);
    console.log("🧱 Ensuring tables exist...");
    
    // Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doraMatrixInfo (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) NOT NULL,
        ticket VARCHAR(50) NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Remove UNIQUE constraints if they exist (migration for existing tables)
    try {
      // Find and drop all unique constraints (for migrating existing tables)
      const constraintQuery = await pool.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'doraMatrixInfo'::regclass
        AND contype = 'u';
      `);
      
      if (constraintQuery.rows.length > 0) {
        for (const row of constraintQuery.rows) {
          await pool.query(`ALTER TABLE doraMatrixInfo DROP CONSTRAINT IF EXISTS ${row.conname};`);
          console.log(`✅ Dropped unique constraint: ${row.conname}`);
        }
      }
    } catch (error) {
      // Constraints might not exist, which is fine for new tables
      console.log("ℹ️ No unique constraints to remove.");
    }

    console.log("✅ Tables ready.");

    // Upsert Git release info (update if exists, insert if not)
    // Since we removed UNIQUE constraints, we use a manual upsert pattern
    const updateResult = await pool.query(
      `UPDATE doraMatrixInfo 
       SET ticket = $2, release_date = $3
       WHERE tag = $1`,
      [tag, commitData?.ticket || "N/A", releaseDate]
    );

    if (updateResult.rowCount === 0) {
      // No existing record found, insert new one
      await pool.query(
        `INSERT INTO doraMatrixInfo (tag, ticket, release_date)
         VALUES ($1, $2, $3)`,
        [tag, commitData?.ticket || "N/A", releaseDate]
      );
      console.log("✅ Successfully inserted new release info in database.");
    } else {
      console.log(`✅ Successfully updated ${updateResult.rowCount} record(s) in database.`);
    }

    
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.message.includes("GitHub API Error")) {
      console.error("   This is a GitHub API error. Please check:");
      console.error("   1. The repository exists and is accessible");
      console.error("   2. The commit SHA is valid");
      console.error("   3. Your GitHub token has the necessary permissions");
    } else {
      console.error("   This is a database error. Please check your database connection and permissions.");
    }
    process.exit(1);
  } finally {
    console.log("🔌 Closing database connection...");
    await pool.end();
    console.log("👋 Database connection closed.");
  }
}
// Run script
storeGitTagAndJiraIssues();



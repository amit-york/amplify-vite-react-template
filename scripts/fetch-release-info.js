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

// const stringData  = 'ticket eng-212: there is demo purpose';
// console.log(stringData.split(":")[0].split(" ")[1].trim())
/**
 * Get the latest commit SHA.
 */
function getLatestCommitSHA() {
  return execSync("git rev-parse HEAD").toString().trim();
}

/**
 * Fetch commit and PR details from GitHub.
 */
async function fetchGitHubData() {
  const repo = getRepoName();
  const sha = getLatestCommitSHA();

  console.log(`🔍 Repo: ${repo}`);
  console.log(`💾 Commit SHA: ${sha}\n`);

  const token = "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"; // Personal Access Token
  if (!token) throw new Error("❌ Missing GITHUB_TOKEN in environment variables");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Fetch latest commit details
  const commitRes = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, { headers });
  const commitData = await commitRes.json();

  const commitInfo = {
    sha: commitData.sha,
    author: commitData.commit?.author.name,
    email: commitData.commit?.author.email,
    date: commitData.commit?.author.date,
    message: commitData.commit?.message,
    url: commitData.html_url,
  };

  console.log("✅ Latest Commit Details:");
  console.log(commitInfo);

  // Fetch PR info associated with this commit
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    headers: { ...headers, Accept: "application/vnd.github.groot-preview+json" },
  });
  const prData = await prRes.json();

  if (prData.length > 0) {
    const pr = prData[0];
    console.log("PR",pr);
    return {
      number: pr.number,
      title: pr.title,
      description: pr.body || "No description provided.",
      author: pr.user.login,
      url: pr.html_url,
      ticket:pr.body.split(":")[0].split(" ")[1].trim()
    }
  } else {
    console.log("\n⚠️ No Pull Request found for this commit.");
  }
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
    const gitPullRequestConfigData = await fetchGitHubData()
    console.log(gitPullRequestConfigData?.ticket)
    console.log("🧱 Ensuring tables exist...");
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doraMatrixInfo (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) UNIQUE NOT NULL,
        ticket VARCHAR(50) UNIQUE NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log("✅ Tables ready.");

    // Insert Git release info
    await pool.query(
      `INSERT INTO doraMatrixInfo (tag, ticket, release_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (tag) DO UPDATE SET release_date = EXCLUDED.release_date;`,
      [tag, gitPullRequestConfigData?.ticket, releaseDate]
    );

    // Read and filter ENG-101 issue only
    // const issues = readFilteredIssue("./resolved_issues.xlsx");

    // if (issues.length === 0) {
    //   console.log("⚠️ No ENG-101 issue found — skipping insert.");
    //   return;
    // }

    // console.log("💾 Inserting Jira issue ENG-101 into DB...");
    // for (const issue of issues) {
    //   const { issue_key, summary, resolution_date, assignee } = issue;
    //   await pool.query(
    //     `INSERT INTO jira_issues (issue_key, summary, resolution_date, assignee, tag)
    //      VALUES ($1, $2, $3, $4, $5)
    //      ON CONFLICT (issue_key)
    //      DO UPDATE SET
    //         summary = EXCLUDED.summary,
    //         resolution_date = EXCLUDED.resolution_date,
    //         assignee = EXCLUDED.assignee,
    //         tag = EXCLUDED.tag;`,
    //     [issue_key, summary, resolution_date, assignee, tag]
    //   );
    // }

   // console.log("✅ ENG-101 issue successfully inserted/updated in DB!");
  } catch (err) {
    console.error("❌ Database error:", err.message);
  } finally {
    console.log("🔌 Closing database connection...");
    await pool.end();
    console.log("👋 Database connection closed.");
  }
}

// Run script
storeGitTagAndJiraIssues();



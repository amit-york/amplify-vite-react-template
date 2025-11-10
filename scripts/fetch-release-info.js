// import { execSync } from "child_process";
// import pg from "pg";
// const { Pool } = pg;

// // Initialize PostgreSQL connection
// const pool = new Pool({
//   host: "3.108.9.100",
//   port: 5432,
//   user: "postgres",
//   password: "postgres",
//   database: "dorametrics",
// });

// // Log database connection
// pool.on("connect", () => {
//   console.log("✅ Database connected successfully!");
// });

// pool.on("error", (err) => {
//   console.error("❌ Unexpected database error:", err.message);
// });

// /**
//  * Fetch the latest Git tag and its commit date.
//  * @returns {Object} { tag, releaseDate }
//  */
// function getGitTagInfo() {
//   try {
//     console.log("🔍 Fetching latest Git tag info...");
//     const tag = execSync("git describe --tags --abbrev=0").toString().trim();
//     const releaseDate = execSync(`git log -1 --format=%aI ${tag}`).toString().trim();
//     console.log(`🏷️  Latest tag: ${tag}, released on: ${releaseDate}`);
//     return { tag, releaseDate };
//   } catch (error) {
//     console.error("❌ Error fetching Git tag info:", error.message);
//     return { tag: null, releaseDate: null };
//   }
// }

// /**
//  * Store Git tag info in PostgreSQL
//  */
// async function storeGitTagInfo() {
//   const { tag, releaseDate } = getGitTagInfo();

//   if (!tag || !releaseDate) {
//     console.log("⚠️ No tag or release date found — skipping DB insert.");
//     await pool.end();
//     return;
//   }

//   try {
//     console.log("🧱 Checking or creating table 'git_releases'...");
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS git_releases (
//         id SERIAL PRIMARY KEY,
//         tag VARCHAR(50) UNIQUE NOT NULL,
//         release_date TIMESTAMPTZ NOT NULL,
//         inserted_at TIMESTAMPTZ DEFAULT NOW()
//       );
//     `);
//     console.log("✅ Table check complete (created if missing).");

//     console.log("💾 Inserting or updating Git tag info...");
//     const query = `
//       INSERT INTO git_releases (tag, release_date)
//       VALUES ($1, $2)
//       ON CONFLICT (tag)
//       DO UPDATE SET release_date = EXCLUDED.release_date;
//     `;

//     await pool.query(query, [tag, releaseDate]);

//     console.log(`✅ Successfully stored tag "${tag}" released on ${releaseDate}`);
//   } catch (err) {
//     console.error("❌ Database error:", err.message);
//   } finally {
//     console.log("🔌 Closing database connection...");
//     await pool.end();
//     console.log("👋 Database connection closed.");
//   }
// }

// //  Run script
// storeGitTagInfo();
// import { execSync } from "child_process";
// import pg from "pg";
// import xlsx from "xlsx";  // 👈 to read Excel file
// import fs from "fs";

// const { Pool } = pg;

// // Initialize PostgreSQL connection
// const pool = new Pool({
//   host: "3.108.9.100",
//   port: 5432,
//   user: "postgres",
//   password: "postgres",
//   database: "dorametrics",
// });

// // Log database connection
// pool.on("connect", () => {
//   console.log("✅ Database connected successfully!");
// });

// pool.on("error", (err) => {
//   console.error("❌ Unexpected database error:", err.message);
// });

// /**
//  * Fetch the latest Git tag and its commit date.
//  */
// function getGitTagInfo() {
//   try {
//     console.log("🔍 Fetching latest Git tag info...");
//     const tag = execSync("git describe --tags --abbrev=0").toString().trim();
//     const releaseDate = execSync(`git log -1 --format=%aI ${tag}`).toString().trim();
//     console.log(`🏷️ Latest tag: ${tag}, released on: ${releaseDate}`);
//     return { tag, releaseDate };
//   } catch (error) {
//     console.error("❌ Error fetching Git tag info:", error.message);
//     return { tag: null, releaseDate: null };
//   }
// }

// /**
//  * Read resolved Jira issues from Excel file.
//  */
// function readResolvedIssuesFromExcel(filePath) {
//   try {
//     console.log(`📖 Reading Excel file: ${filePath}`);
//     if (!fs.existsSync(filePath)) {
//       console.log("⚠️ Excel file not found — skipping Jira issue import.");
//       return [];
//     }

//     const workbook = xlsx.readFile(filePath);
//     const sheetName = workbook.SheetNames[0];
//     const sheet = workbook.Sheets[sheetName];
//     const issues = xlsx.utils.sheet_to_json(sheet);

//     console.log(`📦 Found ${issues.length} Jira issues in Excel file.`);
//     return issues;
//   } catch (error) {
//     console.error("❌ Error reading Excel file:", error.message);
//     return [];
//   }
// }

// /**
//  * Store Git tag and related Jira tickets in PostgreSQL.
//  */
// async function storeGitTagAndJiraIssues() {
//   const { tag, releaseDate } = getGitTagInfo();
//   if (!tag || !releaseDate) {
//     console.log("⚠️ No tag or release date found — skipping DB insert.");
//     await pool.end();
//     return;
//   }

//   try {
//     console.log("🧱 Ensuring tables exist...");
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS git_releases (
//         id SERIAL PRIMARY KEY,
//         tag VARCHAR(50) UNIQUE NOT NULL,
//         release_date TIMESTAMPTZ NOT NULL,
//         inserted_at TIMESTAMPTZ DEFAULT NOW()
//       );

//       CREATE TABLE IF NOT EXISTS jira_issues (
//         id SERIAL PRIMARY KEY,
//         issue_key VARCHAR(20) UNIQUE NOT NULL,
//         summary TEXT,
//         resolution_date TIMESTAMPTZ,
//         assignee TEXT,
//         tag VARCHAR(50) REFERENCES git_releases(tag),
//         inserted_at TIMESTAMPTZ DEFAULT NOW()
//       );
//     `);

//     console.log("✅ Tables ready.");

//     // Insert or update release info
//     await pool.query(
//       `INSERT INTO git_releases (tag, release_date)
//        VALUES ($1, $2)
//        ON CONFLICT (tag) DO UPDATE SET release_date = EXCLUDED.release_date;`,
//       [tag, releaseDate]
//     );

//     // Read Excel file
//     const issues = readResolvedIssuesFromExcel("./resolved_issues.xlsx");

//     if (issues.length === 0) {
//       console.log("⚠️ No issues found — skipping Jira issue insert.");
//       return;
//     }

//     console.log("💾 Inserting Jira issues into DB...");
//     for (const issue of issues) {
//       const { issue_key, summary, resolution_date, assignee } = issue;

//       await pool.query(
//         `INSERT INTO jira_issues (issue_key, summary, resolution_date, assignee, tag)
//          VALUES ($1, $2, $3, $4, $5)
//          ON CONFLICT (issue_key)
//          DO UPDATE SET
//             summary = EXCLUDED.summary,
//             resolution_date = EXCLUDED.resolution_date,
//             assignee = EXCLUDED.assignee,
//             tag = EXCLUDED.tag;`,
//         [issue_key, summary, resolution_date, assignee, tag]
//       );
//     }

//     console.log(`✅ Successfully stored ${issues.length} Jira tickets for release ${tag}`);
//   } catch (err) {
//     console.error("❌ Database error:", err.message);
//   } finally {
//     console.log("🔌 Closing database connection...");
//     await pool.end();
//     console.log("👋 Database connection closed.");
//   }
// }

// // Run script
// storeGitTagAndJiraIssues();

import { execSync } from "child_process";
import pg from "pg";
import xlsx from "xlsx";
import fs from "fs";

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
 * Read Excel file and filter ENG-101 only.
 */
function readFilteredIssue(filePath) {
  try {
    console.log(`📖 Reading Excel file: ${filePath}`);
    if (!fs.existsSync(filePath)) {
      console.log("⚠️ Excel file not found — skipping Jira issue import.");
      return [];
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const issues = xlsx.utils.sheet_to_json(sheet);

    // 🔍 Filter only ENG-101
    const filtered = issues.filter((row) => row.Status === "DONE");

    console.log(`📦 Found ${filtered.length} matching Jira issue(s):`, filtered.map(i => i.issue_key));
    return filtered;
  } catch (error) {
    console.error("❌ Error reading Excel file:", error.message);
    return [];
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
    console.log("🧱 Ensuring tables exist...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS git_releases (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) UNIQUE NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jira_issues (
        id SERIAL PRIMARY KEY,
        issue_key VARCHAR(20) UNIQUE NOT NULL,
        summary TEXT,
        resolution_date TIMESTAMPTZ,
        assignee TEXT,
        tag VARCHAR(50) REFERENCES git_releases(tag),
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log("✅ Tables ready.");

    // Insert Git release info
    await pool.query(
      `INSERT INTO git_releases (tag, release_date)
       VALUES ($1, $2)
       ON CONFLICT (tag) DO UPDATE SET release_date = EXCLUDED.release_date;`,
      [tag, releaseDate]
    );

    // Read and filter ENG-101 issue only
    const issues = readFilteredIssue("./resolved_issues.xlsx");

    if (issues.length === 0) {
      console.log("⚠️ No ENG-101 issue found — skipping insert.");
      return;
    }

    console.log("💾 Inserting Jira issue ENG-101 into DB...");
    for (const issue of issues) {
      const { issue_key, summary, resolution_date, assignee } = issue;
      await pool.query(
        `INSERT INTO jira_issues (issue_key, summary, resolution_date, assignee, tag)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (issue_key)
         DO UPDATE SET
            summary = EXCLUDED.summary,
            resolution_date = EXCLUDED.resolution_date,
            assignee = EXCLUDED.assignee,
            tag = EXCLUDED.tag;`,
        [issue_key, summary, resolution_date, assignee, tag]
      );
    }

    console.log("✅ ENG-101 issue successfully inserted/updated in DB!");
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

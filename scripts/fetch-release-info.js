// import { execSync } from "child_process";
// import pg from "pg";

// const { Pool } = pg;

// // ---------------------
// // 🧱 PostgreSQL Setup
// // ---------------------
// const pool = new Pool({
//   host: process.env.DB_HOST || "3.108.9.100",
//   port: process.env.DB_PORT || 5432,
//   user: process.env.DB_USER || "postgres",
//   password: process.env.DB_PASSWORD || "postgres",
//   database: process.env.DB_NAME || "dorametrics",
// });

// pool.on("connect", () => console.log("✅ Database connected successfully!"));
// pool.on("error", (err) =>
//   console.error("❌ Unexpected database error:", err.message)
// );

// // ---------------------
// // 🔍 Utility Functions
// // ---------------------

// /**
//  * Automatically get repo name (owner/repo) from git remote URL.
//  */
// function getRepoName() {
//   try {
//     const repoUrl = execSync("git config --get remote.origin.url")
//       .toString()
//       .trim();
//     const match = repoUrl.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
//     if (!match) throw new Error("Could not extract repo name from remote URL");
//     return match[1];
//   } catch {
//     return "unknown-repo";
//   }
// }

// /**
//  * Extract ticket number from commit message.
//  * Examples: "ENG-212: message", "ticket ENG-456 fixed bug"
//  */
// function extractTicketFromCommitMessage(commitMessage) {
//   if (!commitMessage) return null;

//   try {
//     const parts = commitMessage.split(":")[0].trim().split(" ");
//     const ticketIndex = parts.findIndex(
//       (part) =>
//         part.toLowerCase().includes("ticket") ||
//         /^[A-Z]+-\d+$/i.test(part) ||
//         part.toLowerCase().includes("eng-")
//     );

//     if (ticketIndex !== -1) {
//       if (
//         parts[ticketIndex].toLowerCase() === "ticket" &&
//         parts[ticketIndex + 1]
//       ) {
//         return parts[ticketIndex + 1].trim().toUpperCase();
//       }
//       if (/^[A-Z]+-\d+$/i.test(parts[ticketIndex])) {
//         return parts[ticketIndex].trim().toUpperCase();
//       }
//     }

//     const firstLine = commitMessage.split("\n")[0];
//     const ticketMatch = firstLine.match(/([A-Z]+-\d+)/i);
//     return ticketMatch ? ticketMatch[1].toUpperCase() : null;
//   } catch (error) {
//     console.error("❌ Error extracting ticket:", error.message);
//     return null;
//   }
// }

// /**
//  * Fetch local Git commit details (no GitHub API).
//  */
// function fetchLocalCommitData() {
//   try {
//     const sha = execSync("git rev-parse HEAD").toString().trim();
//     const author = execSync(`git log -1 --format=%an ${sha}`).toString().trim();
//     const email = execSync(`git log -1 --format=%ae ${sha}`).toString().trim();
//     const date = execSync(`git log -1 --format=%aI ${sha}`).toString().trim();
//     const message = execSync(`git log -1 --format=%B ${sha}`)
//       .toString()
//       .trim();

//     const ticket = extractTicketFromCommitMessage(message);

//     const commitInfo = {
//       sha,
//       author,
//       email,
//       date,
//       message,
//       ticket,
//       repo: getRepoName(),
//     };

//     console.log("✅ Local Commit Details:");
//     console.log(commitInfo);
//     return commitInfo;
//   } catch (error) {
//     console.error("❌ Error fetching local commit info:", error.message);
//     return null;
//   }
// }

// /**
//  * Fetch latest Git tag and release date.
//  */
// function getGitTagInfo() {
//   try {
//     console.log("🔍 Fetching latest Git tag info...");
//     const tag = execSync("git describe --tags --abbrev=0").toString().trim();
//     const releaseDate = execSync(`git log -1 --format=%aI ${tag}`)
//       .toString()
//       .trim();
//     console.log(`🏷️ Latest tag: ${tag}, released on: ${releaseDate}`);
//     return { tag, releaseDate };
//   } catch (error) {
//     console.error("⚠️ No Git tag found:", error.message);
//     return { tag: null, releaseDate: null };
//   }
// }

// // ---------------------
// // 🧩 Main Store Function
// // ---------------------

// async function storeGitTagAndJiraIssues() {
//   const { tag, releaseDate } = getGitTagInfo();
//   if (!tag || !releaseDate) {
//     console.log("⚠️ No tag or release date found — skipping DB insert.");
//     await pool.end();
//     return;
//   }

//   try {
//     const commitData = fetchLocalCommitData();
//     console.log(`🎫 Extracted ticket: ${commitData?.ticket || "N/A"}`);

//     console.log("🧱 Ensuring tables exist...");
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS doraMatrixInfo (
//         id SERIAL PRIMARY KEY,
//         tag VARCHAR(50) NOT NULL,
//         ticket VARCHAR(50) NOT NULL,
//         release_date TIMESTAMPTZ NOT NULL,
//         inserted_at TIMESTAMPTZ DEFAULT NOW()
//       );
//     `);

//     // Drop any old unique constraints (migration safety)
//     const constraintQuery = await pool.query(`
//       SELECT conname
//       FROM pg_constraint
//       WHERE conrelid = 'doraMatrixInfo'::regclass
//       AND contype = 'u';
//     `);

//     if (constraintQuery.rows.length > 0) {
//       for (const row of constraintQuery.rows) {
//         await pool.query(
//           `ALTER TABLE doraMatrixInfo DROP CONSTRAINT IF EXISTS ${row.conname};`
//         );
//         console.log(`✅ Dropped unique constraint: ${row.conname}`);
//       }
//     } else {
//       console.log("ℹ️ No unique constraints to remove.");
//     }

//     console.log("✅ Table ready.");

//     // Upsert Git release info
//     const updateResult = await pool.query(
//       `UPDATE doraMatrixInfo
//        SET ticket = $2, release_date = $3
//        WHERE tag = $1`,
//       [tag, commitData?.ticket || "N/A", releaseDate]
//     );

//     if (updateResult.rowCount === 0) {
//       await pool.query(
//         `INSERT INTO doraMatrixInfo (tag, ticket, release_date)
//          VALUES ($1, $2, $3)`,
//         [tag, commitData?.ticket || "N/A", releaseDate]
//       );
//       console.log("✅ Inserted new release info in database.");
//     } else {
//       console.log(
//         `✅ Updated ${updateResult.rowCount} record(s) in database.`
//       );
//     }

//     console.log("🎯 Data successfully stored for tag:", tag);
//     process.exit(0);
//   } catch (err) {
//     console.error("❌ Error storing Dora data:", err.message);
//     process.exit(1);
//   } finally {
//     console.log("🔌 Closing database connection...");
//     await pool.end();
//     console.log("👋 Database connection closed.");
//   }
// }

// // ---------------------
// // 🚀 Run Script
// // ---------------------
// storeGitTagAndJiraIssues();


//new script
// import { execSync } from "child_process";
// import pg from "pg";

// const { Pool } = pg;

// // ---------------------
// // 🧱 PostgreSQL Setup
// // ---------------------
// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
// });

// pool.on("connect", () => console.log("✅ Database connected successfully!"));
// pool.on("error", (err) =>
//   console.error("❌ Unexpected database error:", err.message)
// );

// // ---------------------
// // 🔍 Utility Functions
// // ---------------------

// /**
//  * Automatically get repo name (owner/repo) from git remote URL.
//  */
// function getRepoName() {
//   try {
//     const repoUrl = execSync("git config --get remote.origin.url")
//       .toString()
//       .trim();
//     const match = repoUrl.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
//     if (!match) throw new Error("Could not extract repo name from remote URL");
//     return match[1];
//   } catch {
//     return "unknown-repo";
//   }
// }

// /**
//  * Extract ALL Jira-style tickets from commit message (e.g. ENG-123, CUR-222).
//  */
// function extractAllTicketsFromCommitMessage(commitMessage) {
//   if (!commitMessage || typeof commitMessage !== "string") return [];

//   try {
//     // Match all patterns like ABC-123, CUR-222, ENG-10, etc.
//     const matches = commitMessage.match(/\b[A-Z]+-\d+\b/gi);

//     if (!matches) {
//       console.log("⚠️ No tickets found in commit message.");
//       return [];
//     }

//     // Convert to uppercase and remove duplicates
//     const uniqueTickets = [...new Set(matches.map((t) => t.toUpperCase()))];

//     console.log("🎫 Extracted Tickets:", uniqueTickets);
//     return uniqueTickets;
//   } catch (error) {
//     console.error("❌ Error extracting tickets:", error.message);
//     return [];
//   }
// }

// /**
//  * Fetch local Git commit details (no GitHub API).
//  */
// function fetchLocalCommitData() {
//   try {
//     const sha = execSync("git rev-parse HEAD").toString().trim();
//     const author = execSync(`git log -1 --format=%an ${sha}`).toString().trim();
//     const email = execSync(`git log -1 --format=%ae ${sha}`).toString().trim();
//     const date = execSync(`git log -1 --format=%aI ${sha}`).toString().trim();
//     const message = execSync(`git log -1 --format=%B ${sha}`)
//       .toString()
//       .trim();

//     const tickets = extractAllTicketsFromCommitMessage(message);
//     const ticketString = tickets.length > 0 ? tickets.join(", ") : "N/A";

//     const commitInfo = {
//       sha,
//       author,
//       email,
//       date,
//       message,
//       tickets,
//       ticketString,
//       repo: getRepoName(),
//     };

//     console.log("✅ Local Commit Details:");
//     console.log(commitInfo);
//     return commitInfo;
//   } catch (error) {
//     console.error("❌ Error fetching local commit info:", error.message);
//     return null;
//   }
// }

// /**
//  * Fetch latest Git tag and release date.
//  */
// function getGitTagInfo() {
//   try {
//     console.log("🔍 Fetching latest Git tag info...");
//     const tag = execSync("git describe --tags --abbrev=0").toString().trim();
//     const releaseDate = execSync(`git log -1 --format=%aI ${tag}`)
//       .toString()
//       .trim();
//     console.log(`🏷️ Latest tag: ${tag}, released on: ${releaseDate}`);
//     return { tag, releaseDate };
//   } catch (error) {
//     console.error("⚠️ No Git tag found:", error.message);
//     return { tag: null, releaseDate: null };
//   }
// }

// // ---------------------
// // 🧩 Main Store Function
// // ---------------------

// async function storeGitTagAndJiraIssues() {
//   const { tag, releaseDate } = getGitTagInfo();
//   if (!tag || !releaseDate) {
//     console.log("⚠️ No tag or release date found — skipping DB insert.");
//     await pool.end();
//     return;
//   }

//   try {
//     const commitData = fetchLocalCommitData();
//     console.log(`🎫 Tickets: ${commitData?.ticketString || "N/A"}`);

//     console.log("🧱 Ensuring tables exist...");
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS doraMatrixInfo (
//         id SERIAL PRIMARY KEY,
//         tag VARCHAR(50) NOT NULL,
//         ticket TEXT NOT NULL,
//         release_date TIMESTAMPTZ NOT NULL,
//         inserted_at TIMESTAMPTZ DEFAULT NOW()
//       );
//     `);

//     // Drop any old unique constraints (migration safety)
//     const constraintQuery = await pool.query(`
//       SELECT conname
//       FROM pg_constraint
//       WHERE conrelid = 'doraMatrixInfo'::regclass
//       AND contype = 'u';
//     `);

//     if (constraintQuery.rows.length > 0) {
//       for (const row of constraintQuery.rows) {
//         await pool.query(
//           `ALTER TABLE doraMatrixInfo DROP CONSTRAINT IF EXISTS ${row.conname};`
//         );
//         console.log(`✅ Dropped unique constraint: ${row.conname}`);
//       }
//     } else {
//       console.log("ℹ️ No unique constraints to remove.");
//     }

//     console.log("✅ Table ready.");

//     // Upsert Git release info
//     const updateResult = await pool.query(
//       `UPDATE doraMatrixInfo
//        SET ticket = $2, release_date = $3
//        WHERE tag = $1`,
//       [tag, commitData?.ticketString || "N/A", releaseDate]
//     );

//     if (updateResult.rowCount === 0) {
//       await pool.query(
//         `INSERT INTO doraMatrixInfo (tag, ticket, release_date)
//          VALUES ($1, $2, $3)`,
//         [tag, commitData?.ticketString || "N/A", releaseDate]
//       );
//       console.log("✅ Inserted new release info in database.");
//     } else {
//       console.log(
//         `✅ Updated ${updateResult.rowCount} record(s) in database.`
//       );
//     }

//     console.log("🎯 Data successfully stored for tag:", tag);
//     process.exit(0);
//   } catch (err) {
//     console.error("❌ Error storing Dora data:", err.message);
//     process.exit(1);
//   } finally {
//     console.log("🔌 Closing database connection...");
//     await pool.end();
//     console.log("👋 Database connection closed.");
//   }
// }

// // ---------------------
// // 🚀 Run Script
// // ---------------------
// storeGitTagAndJiraIssues();



//New Script with current_dora_release_info
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
  if (!commitMessage || typeof commitMessage !== "string") return [];
  try {
    const matches = commitMessage.match(/\b[A-Z]+-\d+\b/gi);
    if (!matches) {
      console.log("⚠️ No tickets found in commit message.");
      return [];
    }
    return [...new Set(matches.map((t) => t.toUpperCase()))];
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
      repo: getRepoName(),
    };
  } catch (error) {
    console.error("❌ Error fetching local commit info:", error.message);
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
  const { tag, releaseDate } = getGitTagInfo();
  if (!tag || !releaseDate) {
    console.log("⚠️ No tag or release date found — skipping DB insert.");
    await pool.end();
    return;
  }

  try {
    const commitData = fetchLocalCommitData();
    console.log(`🎫 Tickets: ${commitData?.ticketString || "N/A"}`);

    console.log("🧱 Ensuring table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS current_dora_release_info (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) NOT NULL,
        ticket TEXT NOT NULL,
        release_date TIMESTAMPTZ NOT NULL,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const constraintQuery = await pool.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'current_dora_release_info'::regclass
      AND contype = 'u';
    `);

    if (constraintQuery.rows.length > 0) {
      for (const row of constraintQuery.rows) {
        await pool.query(
          `ALTER TABLE current_dora_release_info DROP CONSTRAINT IF EXISTS ${row.conname};`
        );
        console.log(`✅ Dropped unique constraint: ${row.conname}`);
      }
    }

    console.log("💾 Upserting data...");

    const updateResult = await pool.query(
      `UPDATE current_dora_release_info
       SET ticket = $2, release_date = $3
       WHERE tag = $1`,
      [tag, commitData?.ticketString || "N/A", releaseDate]
    );

    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO current_dora_release_info (tag, ticket, release_date)
         VALUES ($1, $2, $3)`,
        [tag, commitData?.ticketString || "N/A", releaseDate]
      );
      console.log("✨ Inserted new release info.");
    } else {
      console.log(`🔁 Updated ${updateResult.rowCount} record(s).`);
    }

    console.log("🎯 Data stored for tag:", tag);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error storing data:", err.message);
    process.exit(1);
  } finally {
    console.log("🔌 Closing DB connection...");
    await pool.end();
    console.log("👋 Done.");
  }
}

storeGitTagAndJiraIssues();

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

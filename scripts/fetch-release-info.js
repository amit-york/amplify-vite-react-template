import { execSync } from "child_process";

/**
 * Fetch the latest Git tag and its commit date.
 * @returns {Object} { tag, releaseDate }
 */
export function getGitTagInfo() {
  try {
    // Get the latest Git tag
    const tag = execSync("git describe --tags --abbrev=0").toString().trim();

    // Get the date of the commit associated with that tag
    const releaseDate = execSync(`git log -1 --format=%aI ${tag}`).toString().trim();

    return { tag, releaseDate };
  } catch (error) {
    console.error("❌ Error fetching Git tag info:", error.message);
    return { tag: null, releaseDate: null };
  }
}

// Example usage (optional)
if (import.meta.url === `file://${process.argv[1]}`) {
  const info = getGitTagInfo();
  console.log("Latest Git Tag Info:", info);
}

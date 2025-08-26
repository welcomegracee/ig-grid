// api/notion.js — Title, Caption, Date, Status, Image
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DB_ID;

/**
 * Only show certain statuses? Put them here, e.g., ["Done"].
 * Leave [] to show all.
 */
const FILTER_STATUSES = []; // e.g., ["Done"]

export default async function handler(req, res) {
  try {
    const response = await notion.databases.query({
      database_id: DB_ID,
      page_size: 60
    });

    const items = response.results.map(page => {
      const props = page.properties || {};

      // IMAGE (Files & media)
      let imageUrl = "";
      if (props.Image?.type === "files") {
        const files = props.Image.files || [];
        imageUrl = files[0]?.external?.url || files[0]?.file?.url || "";
      }

      // CAPTION: prefer 'Caption' (rich_text), else fall back to Title
      let caption = "";
      if (props.Caption?.type === "rich_text") {
        caption = props.Caption.rich_text?.[0]?.plain_text || "";
      }
      if (!caption && props.Title?.type === "title") {
        caption = props.Title.title?.[0]?.plain_text || "";
      }

      // STATUS (Select)
      const status =
        props.Status?.type === "select" ? (props.Status.select?.name || "") : "";

      // DATE (Date) or fallback to created_time
      const date =
        props.Date?.type === "date" ? (props.Date.date?.start || null) : null;

      return {
        id: page.id,
        image: imageUrl,
        caption,
        status,
        date,
        created_time: page.created_time
      };
    })
    .filter(i => i.image) // require an uploaded image
    .filter(i => (FILTER_STATUSES.length ? FILTER_STATUSES.includes(i.status) : true))
    // newest first by Date; if missing, by created_time
    .sort((a, b) => {
      const ad = a.date ? Date.parse(a.date) : Date.parse(a.created_time);
      const bd = b.date ? Date.parse(b.date) : Date.parse(b.created_time);
      return bd - ad;
    });

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      hint: "Check NOTION_DB_ID, NOTION_TOKEN, Share→Connections on the DB, and that at least one row has an uploaded Image."
    });
  }
}

import type { Heading, Paragraph, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { toString as mdastToString } from "mdast-util-to-string";

/**
 * Transforme chaque `### h3` situé sous le `## Expérience` en bloc
 * `<details class="experience"><summary>…</summary><div class="exp-body">…</div></details>`.
 *
 * - Le titre h3 et le 1er paragraphe (meta employeur/dates) restent visibles dans le summary
 * - Le reste (paragraphes, listes) est placé dans .exp-body et masqué quand replié
 * - Limite la portée à la section dont le titre h2 commence par "expérience" (insensible accent/casse)
 */

function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toLowerCase();
}

function isHeading(node: RootContent | undefined): node is Heading {
	return !!node && node.type === "heading";
}

function rawHtml(value: string): RootContent {
	return { type: "html", value } as RootContent;
}

export const remarkCollapsibleExperience: Plugin<[], Root> = () => (tree) => {
	const children = tree.children;
	const out: RootContent[] = [];

	let i = 0;
	while (i < children.length) {
		const node = children[i];

		// Détecte le h2 "Expérience"
		if (
			isHeading(node) &&
			node.depth === 2 &&
			normalize(mdastToString(node)).startsWith("experience")
		) {
			out.push(node);
			i++;

			// Parcourt jusqu'au prochain h2 (ou fin)
			while (i < children.length) {
				const next = children[i];
				if (isHeading(next) && next.depth <= 2 && next !== node) break;

				if (isHeading(next) && next.depth === 3) {
					// Collecte les frères jusqu'au prochain h≤3
					const headingHtml = `<h3>${escapeHtml(mdastToString(next))}</h3>`;
					i++;

					const block: RootContent[] = [];
					while (i < children.length) {
						const sibling = children[i];
						if (isHeading(sibling) && sibling.depth <= 3) break;
						block.push(sibling);
						i++;
					}

					// 1er paragraphe = meta (employeur/dates) → reste dans <summary>
					let metaHtml = "";
					const bodyNodes: RootContent[] = [];
					let metaConsumed = false;
					for (const n of block) {
						if (!metaConsumed && n.type === "paragraph") {
							metaHtml = `<p class="exp-meta">${paragraphToInlineHtml(n)}</p>`;
							metaConsumed = true;
						} else {
							bodyNodes.push(n);
						}
					}

					out.push(rawHtml(`<details class="experience"><summary>${headingHtml}${metaHtml}</summary><div class="exp-body">`));
					out.push(...bodyNodes);
					out.push(rawHtml(`</div></details>`));
				} else {
					out.push(next);
					i++;
				}
			}
			continue;
		}

		out.push(node);
		i++;
	}

	tree.children = out;
};

/** Sérialise le contenu inline d'un paragraphe en HTML (gras, italique, liens, code, texte) */
function paragraphToInlineHtml(p: Paragraph): string {
	return p.children.map(inlineToHtml).join("");
}

// biome-ignore lint/suspicious/noExplicitAny: mdast phrasing nodes
function inlineToHtml(node: any): string {
	switch (node.type) {
		case "text":
			return escapeHtml(node.value);
		case "strong":
			return `<strong>${(node.children ?? []).map(inlineToHtml).join("")}</strong>`;
		case "emphasis":
			return `<em>${(node.children ?? []).map(inlineToHtml).join("")}</em>`;
		case "inlineCode":
			return `<code>${escapeHtml(node.value)}</code>`;
		case "link":
			return `<a href="${escapeAttr(node.url)}">${(node.children ?? []).map(inlineToHtml).join("")}</a>`;
		case "break":
			return "<br/>";
		default:
			return escapeHtml(mdastToString(node));
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/"/g, "&quot;");
}

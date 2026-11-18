// Integration stub for the Tidewater Trip Desk runtime container.
// The lead replaces this stub with the live reference runtime bootstrapper,
// which dispatches window CustomEvents named "passport:report" with detail: { report }.

export async function startDesk(root: HTMLElement): Promise<void> {
  root.textContent = "";
  const paragraph = document.createElement("p");
  paragraph.className = "text-sm leading-relaxed text-(--ap-text)/85";
  paragraph.textContent =
    "Loading the Tidewater Trip Desk agent runtime. When the desk contacts a partner network, its passport report appears beside this panel.";
  root.appendChild(paragraph);
}

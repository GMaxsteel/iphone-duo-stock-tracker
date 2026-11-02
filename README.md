# Personal iPhone Duo pickup checker

Checks all storage sizes and both colors at six Apple Japan stores in and around Tokyo. One city-wide request is scheduled approximately every five minutes, with persistent leases and backoff enforced by a private Cloudflare controller.

GitHub obtains a short-lived identity token restricted by the controller to this repository, immutable owner/repository IDs, main branch, workflow path and scheduled/manual events. No Telegram credential is stored in this repository or in GitHub Actions secrets. Telegram alerts and inventory history remain in Cloudflare. The runner publishes leased ntfy alerts and acknowledges each independently.

A manual verification run checks Apple access and sends a clearly labeled ntfy TEST. Scheduled runs only poll when monitoring is enabled in the controller, and honor its cooldowns. GitHub schedules can be delayed. Check Actions and the controller's last successful check time before relying on the monitor.

Apple's public storefront interface is undocumented. Missing data or failed requests mean unknown stock; notifications never reserve devices.

# Bootstrap the project

This will be a SPA application built with React, Vite, and a light weight Hono
backend server. It should be built to deploy on ChatGPT sites, with full local
development support.

The features to add first:

- Authenticated users via ChatGPT Sites auth (ensure this works in local dev as
  well)
- The ability to create and save ship designs using Cloudflare D1 (via ChatGPT
  Sites, with a local dev option as well)
- A basic editor that appears to edit a spaceship floating in space. There
  should be a lefthand toolbar allowing the user to add 3D polygonal shapes to a
  3D editing canvas.
- Once added, shapes should be movable with the mouse in three dimensions.
- The user should be able to pan the camera persepctive, or rotate around a
  center point.
- All the editing functionality exposed to the user should also be exposed to a
  model using WebMCP, so tool calls can drive the editing experience as well.

Visual design:

- It should be sci-fi retro and inspired by PC games of the early 1990s
- Basic shapes and lines, ideally looking like it's rendering on a
  retro-futuristic holographic projector

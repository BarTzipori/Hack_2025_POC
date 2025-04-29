# Hack_2025_POC
This is a POC for TechnionHACK2025 

# Installation:

please download the folder and install it as a chrome extension using development mode.

# Current features:

1. Displays a graph showing locations of "problematic" claims throughout the video, and an indication of the location in the video you are currently vieweing.
2. Locations of problematic claims are shown as dots on the graph, the redder the dot - the more severe the claim is.
3. Clicking directly on a point, will move to a timestamp a few moments before a claim, so you can hear it again.
4. A chime sound will be played as you encounter a problematic claim + a pop up notification displaying it (see image below).
5. Hovering over a dot in the graph also shows a brief explanation about the claim.
6. Plug in settings are adjustabme via the settings menu (colors of all elements can be adjusted, the chime can be turned off and the graph can be hidden).

# Limitations:

As it stands, I MANUALLY impented three claims, just as a way of demonstrating it (the input for the plugin is timestamp, and claim text). This should be changed to a dynamic system that gets the same input (timestamp, and textual information) from our truth checking pipeline.
This will be the main addition to this plugin going forward.
![הדגמת פלאג אין](https://github.com/user-attachments/assets/d14b65ca-16a2-43a6-aff8-a7527faf6187)

import math
import plotly.graph_objs as go


class DailySCC:
    def __init__(self, minute_type=True, xmax=280, chart_window_in_days=280):
        #self.width = 900
        self.minute_type = minute_type
        self.height = 675  # Layout height (arbitrary). Width will be calculated.
        self.style_color = '#05c3de'  # Color for spines, ticks, and labels
        self.grid_color = '#6ad1e3'  # Color for grid lines
        self.font_family = 'Tahoma, DejaVu Sans, Verdana, sans-serif'
        self.font_size = 18
        self.font_weight = 'bold'
        self.grid_width = 1
        self.spine_width = 2

        if minute_type:
            # Daily minute count
            self.ymin = 0.001 * 0.69  # Minimum y-axis value
            self.ymax = 1000  # Maximum y-axis
            self.left_y_minor_vals = [0.005, 0.05, 0.5, 5, 50, 500]
            self.left_y_major_vals = [0.001, 0.01, 0.1, 1, 10, 100, 1000]
        else:
            # Daily count
            self.ymin = 1 * 0.69  # Minimum y-axis value
            self.ymax = 1000000  # Maximum y-axis
            self.left_y_minor_vals = [5, 50, 500, 5000, 50000, 500000]
            self.left_y_major_vals = [1, 10, 100, 1000, 10000, 100000, 1000000]

        # Calculate layout width from layout height.
        self.xmin = 0
        self.xmax = xmax
        self.chart_window_in_days = chart_window_in_days
        self.margin_l = 110 if minute_type else 140
        self.margin_r = 120 if minute_type else 105
        self.margin_t = 120
        self.margin_b = 90

        self.deg = 34  # desired angle of doubling in degrees
        self.unit = 7  # number of timings per doubling
        self.yaxis_px = self.height - (self.margin_t + self.margin_b) # y-axis length in px
        self.y_axis = math.log10(self.ymax) - math.log10(self.ymin) # y-axis length
        self.delta_y = math.log10(2 ** (self.chart_window_in_days / self.unit))  # Use viewport_days instead of xmax
        self.delta_y_px = self.delta_y / self.y_axis * self.yaxis_px
        self.xaxis_px = self.delta_y_px / math.tan(math.radians(self.deg))
        self.width = self.xaxis_px + (self.margin_l + self.margin_r)

        # Ticks
        px_right_n_left_y_tick_len = 6
        self.paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / self.xaxis_px

        self.fig = go.Figure()

    def create_xaxis(self):
        return dict(
            tickvals=list(range(0, self.xmax + 14, 14)),
            tickmode='array',
            tick0=0,
            ticklabelstandoff=18,
            showline=False,
            tickfont=dict(
                size=self.font_size,
                family=self.font_family,
                color=self.style_color,
                weight=self.font_weight
            ),
            title=dict(
                text='',
                standoff=0,
                font=dict(
                    size=self.font_size,
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                )
            ),
            showgrid=False,
            zeroline=False,
            range=[-0.2, self.chart_window_in_days + 0.2],  # Fixed viewport size
            fixedrange=False,
        )

    def create_left_yaxis(self):
        # Define the left y-axis tick positions
        left_y_ticks = [10 ** e for e in [math.log10(i) for i in self.left_y_major_vals]]
        return dict(
            showline=False,  # Hide the left y-axis spine
            tickvals=left_y_ticks,  # Set y-axis tick values
            tickfont=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight),
            ticklabelposition='outside',  # Keep labels outside of the series
            ticklabelstandoff=7,  # Push the y-axis tick labels further left
            title=dict(
                text="COUNT PER MINUTE" if self.minute_type else "COUNT PER DAY",
                standoff=0,
                font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight)
            ),
            showgrid=False,  # Disable grid lines
            zeroline=False,
            type='log',
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            tickformat=',',  # Ensures tick labels are formatted with commas, e.g., 1,000,000
            fixedrange=True
        )

    def add_custom_y_axis_labels(self):
        font_size_scale = 0.7
        x_shift = -5  # Adjust this value to fine-tune horizontal spacing

        # Loop through each tick value
        for tick in self.left_y_minor_vals:
            # Convert the tick value to its log10 equivalent for correct placement on a log scale
            log_tick = math.log10(tick)

            self.fig.add_annotation(
                xref="paper",  # Position based on the 'paper' space, so x is static
                yref="y",  # Reference the y-axis for the y-values
                x=-0.004,  # Position slightly left of the default y-axis labels
                y=log_tick,  # Y value for the annotation, converted to log scale
                text=f"{tick:,}",  # The custom y-axis value to display
                showarrow=False,  # No arrow, we just need text
                font=dict(
                    size=self.font_size * font_size_scale,  # Reduce font size by 30%
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                ),
                align="right",  # Align the text to the right so it lines up with the axis
                xanchor="right",  # Anchor the text by the right edge for consistent horizontal alignment
                xshift=x_shift,  # Adjust horizontal distance to the ticks uniformly
                yanchor="middle",  # Anchor the text vertically centered at the tick position
                name='minor-left-y'
            )

    def create_right_yaxis(self):
        if self.minute_type:
            right_axis_color = self.style_color
        else:
            # Turns off visibility
            right_axis_color = 'rgba(0,0,0,0)'

        right_y_ticks_seconds = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 20, 60, 50, 100, 200, 500, 1000, 60 * 2, 60 * 4, 60 * 8, 60 * 16]
        right_y_ticks = [1 / m for m in right_y_ticks_seconds]
        right_y_ticks_log_mapped = [math.log10(t) for t in right_y_ticks]
        right_y_labels = ['10" sec', '15"', '20"', '30"', "1' min", "2'", "5'", "10'", "20'", "            – 1 h", "50'", "100'", "200'", "500'", "1000'",
                               "            – 2 h",
                               "            – 4 h",
                               "            – 8 h",
                               "            – 16 h"]

        # Add COUNTING TIMES annotation
        ann_offset = 1 + (30 / self.xaxis_px)  # Offset 30 pixels
        self.fig.add_annotation(
            x=ann_offset,
            y=0.95,
            xref="paper",
            yref="paper",
            text="COUNTING TIMES",
            showarrow=False,  # No arrow for annotation
            font=dict(size=self.font_size * 0.7, family=self.font_family, color=right_axis_color, weight='bold'),
            # Customize text style
            align="center",  # Center align the text
            textangle=-90,
        )

        return dict(
            showline=False,  # Hide the right y-axis spine
            tickfont=dict(size=self.font_size * 0.6, family=self.font_family, color=right_axis_color, weight=self.font_weight),
            ticklabelposition='outside',  # Keep labels outside of the series
            ticklabelstandoff=10,  # Increase this value to push the y-axis tick labels further to the right
            showgrid=False,  # Disable grid lines for the right y-axis
            zeroline=False,
            side='right',  # Position the y-axis on the right
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            overlaying='y',  # Overlay on the same series
            tickmode='array',  # Explicitly specify tick mode to use array of tickvals and ticktext
            tickvals=right_y_ticks_log_mapped,  # Place the right y-axis labels based on the mapped log values
            ticktext=right_y_labels,  # Labels for the right y-axis (time),
            fixedrange=True
        )

    def add_placeholder_data(self):
        # Apparently needed, otherwise the graph gets distorted
        x_placeholder = []
        y_placeholder = []
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Left Axis Trace"))
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Right Axis Trace", yaxis='y2', visible=False))

    def major_vertical_grid(self):
        """Major vertical grid lines (every 7 days) - trace-based for pan performance."""
        major_val = 7
        scaling_factor = 2.5
        x_vals = []
        y_vals = []
        for i in range(self.xmin + 7, self.xmax, major_val):
            x_vals.extend([i, i, None])
            y_vals.extend([self.ymin, self.ymax, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
            hoverinfo='skip',
            showlegend=False,
            name='grid-major-vertical'
        ))

    def left_n_right_fake_spines(self):
        scaling_factor = 2.5
        for i in [self.xmin, self.xmax]:
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='y',
                y0=self.ymin,
                y1=self.ymax,
                line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
                layer='below',
                name='spine'
            )

    def minor_vertical_grid(self):
        """Minor vertical grid lines (every day) - trace-based for pan performance."""
        x_vals = []
        y_vals = []
        for i in range(0, self.xmax):
            x_vals.extend([i, i, None])
            y_vals.extend([self.ymin, self.ymax, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-minor-vertical'
        ))

    def major_horizontal_grid(self):
        """Major and sub-major horizontal grid lines - trace-based for pan performance."""
        scaling_factor = 1.5
        # Extend lines beyond visible area to handle panning
        x_buffer = 500
        x_left = self.xmin - x_buffer
        x_right = self.xmax + x_buffer

        # Major horizontal lines (thicker)
        x_vals_major = []
        y_vals_major = []
        for power in self.left_y_major_vals:
            x_vals_major.extend([x_left, x_right, None])
            y_vals_major.extend([power, power, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals_major,
            y=y_vals_major,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
            hoverinfo='skip',
            showlegend=False,
            name='grid-major-horizontal'
        ))

        # Sub-major horizontal lines (thinner)
        x_vals_sub = []
        y_vals_sub = []
        for power in self.left_y_minor_vals:
            x_vals_sub.extend([x_left, x_right, None])
            y_vals_sub.extend([power, power, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals_sub,
            y=y_vals_sub,
            mode='lines',
            line=dict(color=self.grid_color, width=self.spine_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-sub-horizontal'
        ))

    def minor_horizontal_grid(self):
        """Minor horizontal grid lines - trace-based for pan performance."""
        # Extend lines beyond visible area to handle panning
        x_buffer = 500
        x_left = self.xmin - x_buffer
        x_right = self.xmax + x_buffer

        x_vals = []
        y_vals = []
        for power in self.left_y_major_vals:
            # Use pure Python instead of np.arange to avoid serialization issues
            power_range = [power * i for i in range(1, 10)]
            for val in power_range:
                if val not in self.left_y_minor_vals:
                    x_vals.extend([x_left, x_right, None])
                    y_vals.extend([val, val, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-minor-horizontal'
        ))

    def add_fake_spines(self):
        position = -0.03  # Move the line down vertically within the series
        # Bottom spine
        self.fig.add_shape(
            type="line",
            x0=self.xmin, x1=self.xmax, yref='paper', y0=position, y1=position,
            line=dict(color=self.grid_color, width=self.spine_width))

        # Add tick marks on every n-th x value along the bottom spine
        for i in range(0, self.xmax + self.unit, self.unit * 2):
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='paper',  # Use paper ref to position relative to the bottom spine
                y0=position + 0.01, y1=position - 0.01,  # Small vertical line for the tick mark
                line=dict(color=self.grid_color, width=self.spine_width),
                name='x-tick'
            )

        # Top spine
        self.fig.add_shape(type='line',
                           x0=-self.paper_right_n_left_y_tick_len,
                           x1=1,
                           y0=self.ymax, y1=self.ymax,
                           xref='paper', yref='y',
                           line=dict(color=self.grid_color, width=self.spine_width * 2),
                           name='top-spine'
                           )

        # Add tick marks on every n-th x value along the top spine
        for i in range(0, self.xmax + 28, self.unit * 4):
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='paper',  # Use paper ref to position relative to the bottom spine
                y0=1 + 0.012, y1=1,  # Small vertical line for the tick mark
                line=dict(color=self.grid_color, width=self.spine_width),
                name='top-x-tick'
            )

    def custom_left_y_ticks(self):
        ticks = self.left_y_major_vals + self.left_y_minor_vals
        for tick in ticks:
            tick_width = self.spine_width if tick in self.left_y_major_vals else self.grid_width
            self.fig.add_shape(
                type="line",
                xref="paper",  # Reference the 'paper' coordinates for x-axis
                yref="y",      # Reference the actual y-axis values
                x0=0, x1=-self.paper_right_n_left_y_tick_len,  # Extend the tick outward from the y-axis
                y0=tick, y1=tick,       # Position the tick at the y-axis value
                line=dict(color=self.grid_color, width=tick_width),
                name='left-y-tick'
            )

    def custom_right_y_ticks(self):
        if self.minute_type:
            right_y_ticks = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 20, 60, 50, 100, 200, 500, 1000, 60 * 2, 60 * 4, 60 * 8, 60 * 16]
            right_y_ticks_hours = [60, 60 * 2, 60 * 4, 60 * 8, 60 * 16]

            for tick in right_y_ticks:
                if tick in self.left_y_major_vals:
                    tick_width = self.spine_width
                elif tick not in right_y_ticks_hours:
                    tick_width = self.grid_width
                else:
                    tick_width = 0

                self.fig.add_shape(
                    type="line",
                    xref="paper",  # Reference the 'paper' coordinates for x-axis
                    yref="y",      # Reference the actual y-axis values
                    x0=1, x1=1 + self.paper_right_n_left_y_tick_len,  # Extend the tick outward from the right y-axis
                    y0=1/tick, y1=1/tick,      # Position the tick at the corresponding right y-axis value
                    line=dict(color=self.grid_color, width=tick_width),
                    name='right-y-tick'
                )

    def add_date_lines(self):
        font_scale = 0.8

        # Offset values in pixels
        # date_line_pixel_offset = 35
        date_text_pixel_offset = 40
        week_count_pixel_offset = 30
        top_x_title_pixel_offset = 100
        bottom_x_title_pixel_offset = 75

        # Convert pixel offsets to 'paper' offsets
        # date_line_paper_offset = date_line_pixel_offset / self.yaxis_px
        date_text_paper_offset = date_text_pixel_offset / self.yaxis_px
        week_count_paper_offset = week_count_pixel_offset / self.yaxis_px
        top_x_title_paper_offset = top_x_title_pixel_offset / self.yaxis_px
        bottom_x_title_paper_offset = bottom_x_title_pixel_offset / self.yaxis_px

        # Get positions as 'paper' coordinates
        # date_line_pos = 1 + date_line_paper_offset
        date_text_pos = 1 + date_text_paper_offset
        week_count_pos = 1 + week_count_paper_offset
        top_x_title_pos = 1 + top_x_title_paper_offset
        bottom_x_title_pos = 0 - bottom_x_title_paper_offset

        self.fig.add_annotation(
            x=0.5,
            y=bottom_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR WEEKS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='top_x_title'
        )

        self.fig.add_annotation(
            x=0.5,
            y=top_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR DAYS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='bottom_x_title'
        )

        for idx, middle in enumerate(range(0, self.xmax + 28, 28)):

            # Add the line
            # self.fig.add_shape(
            #     type="line",
            #     x0=middle,
            #     x1=middle,
            #     xref="paper",  # Use 'paper' for all lines to allow extensions
            #     yref="paper",  # Reference 'paper' for vertical position
            #     y0=date_line_pos,
            #     y1=date_line_pos,
            #     line=dict(color=self.grid_color, width=self.spine_width),  # Customize line appearance
            #     layer="below",  # Ensure the line is below data and grid
            #     name='date-line'
            # )

            # Add week count
            self.fig.add_annotation(
                x=middle,  # Use x-coordinate value for placement
                y=week_count_pos,
                xref="x",  # Align with the x-axis
                yref="paper",  # Use 'paper' for vertical position
                text=str(int(middle / 7)),  # Placeholder text
                showarrow=False,  # No arrow for annotation
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color, weight='bold'),
                # Customize text style
                align="center",  # Center align the text
                name='week-count'
            )

            self.fig.add_annotation(
                x=middle,  # Use the actual x-coordinate value for placement
                y=date_text_pos,  # Adjust placement using paper_offset (1 represents top of paper)
                xref="x",  # Align with the x-axis
                yref="paper",  # Reference 'paper' for vertical position
                text=f"INSERTDATE{idx}",  # Empty text - will be filled in by JavaScript
                showarrow=False,  # No arrow for annotation
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color,
                          weight='bold'),
                align="center",  # Center align the text
                name=f'date-text-{idx}'  # Indexed name for JavaScript to find this annotation
            )

    def get_plot(self, to_json=False):
        # Grid traces must be added FIRST to render behind data traces
        # (trace-based grid for pan performance optimization)
        self.minor_vertical_grid()
        self.major_vertical_grid()
        self.minor_horizontal_grid()
        self.major_horizontal_grid()

        # Add placeholder data traces (will appear in front of grid)
        self.add_placeholder_data()

        # Update layout with x-axis, left y-axis, right y-axis, and margins to make space for the lowered x-axis
        self.fig.update_layout(
            showlegend=False,
            xaxis=self.create_xaxis(),
            yaxis=self.create_left_yaxis(),
            yaxis2=self.create_right_yaxis(),  # Use the specified ticks/labels for the right y-axis
            plot_bgcolor='white',  # Set the background of the series to white
            paper_bgcolor='white',  # Set the background of the surrounding area to white
            width=self.width,  # Set the width of the figure
            height=self.height,  # Set the height of the figure
            autosize=False,  # Disable automatic resizing completely
            dragmode='pan',  # Enable panning instead of zooming
            annotations=[],  # Initialize space for annotations
            margin=dict(l=self.margin_l, r=self.margin_r, t=self.margin_t, b=self.margin_b)
        )

        # Axes and ticks (remain as shapes - few in number, use paper coordinates)
        self.custom_left_y_ticks()
        self.custom_right_y_ticks()
        self.add_custom_y_axis_labels()

        # Other elements (remain as shapes)
        self.add_fake_spines()
        self.left_n_right_fake_spines()
        self.add_date_lines()

        return self.fig.to_json() if to_json else self.fig


def preview(minute_type=True):
    """Show the chart in browser for testing."""
    plot = DailySCC(minute_type=minute_type)
    fig = plot.get_plot()
    fig.show()


if __name__ == '__main__':
    preview()

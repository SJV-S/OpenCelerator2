import math
import plotly.graph_objs as go


class FrequencyCollectionsSCC:
    def __init__(self, minute_type=True, num_columns=10, points_per_column=7):
        """
        Frequency Collections / Distributions Chart using Plotly.

        Args:
            minute_type: If True, shows "Count Per Minute" (0.001-1000 range).
                        If False, shows "Count" (1-1,000,000 range).
            num_columns: Number of "Counted" columns. Default 10 (narrow), use 6 for wide.
            points_per_column: Number of x-positions within each column for data points.
        """
        self.minute_type = minute_type
        self.num_columns = num_columns
        self.points_per_column = points_per_column
        self.xmax = num_columns * points_per_column

        self.height = 675
        self.style_color = '#05c3de'
        self.grid_color = '#6ad1e3'
        self.font_family = 'Tahoma, DejaVu Sans, Verdana, sans-serif'
        self.font_size = 18
        self.font_weight = 'bold'
        self.grid_width = 1
        self.spine_width = 2

        if minute_type:
            self.ymin = 0.001 * 0.69
            self.ymax = 1000
            self.left_y_minor_vals = [0.005, 0.05, 0.5, 5, 50, 500]
            self.left_y_major_vals = [0.001, 0.01, 0.1, 1, 10, 100, 1000]
        else:
            self.ymin = 1 * 0.69
            self.ymax = 1000000
            self.left_y_minor_vals = [5, 50, 500, 5000, 50000, 500000]
            self.left_y_major_vals = [1, 10, 100, 1000, 10000, 100000, 1000000]

        self.xmin = 0
        self.margin_l = 110
        self.margin_r = 50
        self.margin_t = 80
        self.margin_b = 100

        # Calculate layout width from layout height (same as Daily chart)
        self.deg = 34  # desired angle of doubling in degrees
        self.unit = 7  # number of timings per doubling
        self.yaxis_px = self.height - (self.margin_t + self.margin_b)
        self.y_axis = math.log10(self.ymax) - math.log10(self.ymin)
        self.delta_y = math.log10(2 ** (self.xmax / self.unit))
        self.delta_y_px = self.delta_y / self.y_axis * self.yaxis_px
        self.xaxis_px = self.delta_y_px / math.tan(math.radians(self.deg))
        self.width = self.xaxis_px + (self.margin_l + self.margin_r)

        px_left_y_tick_len = 6
        self.paper_left_y_tick_len = px_left_y_tick_len / self.xaxis_px

        self.fig = go.Figure()

    def create_xaxis(self):
        # X-axis: no tick labels on the axis itself (labels are annotations below)
        return dict(
            tickvals=[],
            ticktext=[],
            tickmode='array',
            showline=False,
            showgrid=False,
            zeroline=False,
            range=[-0.2, self.xmax + 0.2],
            fixedrange=False,
        )

    def create_left_yaxis(self):
        left_y_ticks = [10 ** e for e in [math.log10(i) for i in self.left_y_major_vals]]
        return dict(
            showline=False,
            tickvals=left_y_ticks,
            tickfont=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight),
            ticklabelposition='outside',
            ticklabelstandoff=7,
            title=dict(
                text="Count Per Minute" if self.minute_type else "Count",
                standoff=0,
                font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight)
            ),
            showgrid=False,
            zeroline=False,
            type='log',
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            tickformat=',',
            fixedrange=True
        )

    def add_custom_y_axis_labels(self):
        font_size_scale = 0.7
        x_shift = -5

        for tick in self.left_y_minor_vals:
            log_tick = math.log10(tick)

            self.fig.add_annotation(
                xref="paper",
                yref="y",
                x=-0.004,
                y=log_tick,
                text=f"{tick:,}",
                showarrow=False,
                font=dict(
                    size=self.font_size * font_size_scale,
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                ),
                align="right",
                xanchor="right",
                xshift=x_shift,
                yanchor="middle",
                name='minor-left-y'
            )

    def add_placeholder_data(self):
        x_placeholder = []
        y_placeholder = []
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Data Trace"))

    def major_vertical_grid(self):
        """Major vertical grid lines at column boundaries - trace-based for pan performance."""
        scaling_factor = 2.5
        x_vals = []
        y_vals = []
        for i in range(0, self.xmax + 1, self.points_per_column):
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

    def minor_vertical_grid(self):
        """Minor vertical grid lines within each column - trace-based for pan performance."""
        x_vals = []
        y_vals = []
        for i in range(0, self.xmax + 1):
            # Skip column boundaries (handled by major grid)
            if i % self.points_per_column != 0:
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
        x_buffer = 500
        x_left = self.xmin - x_buffer
        x_right = self.xmax + x_buffer

        # Major horizontal lines
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

        # Sub-major horizontal lines
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
        # Bottom spine
        position = -0.03
        self.fig.add_shape(
            type="line",
            x0=self.xmin, x1=self.xmax, yref='paper', y0=position, y1=position,
            line=dict(color=self.grid_color, width=self.spine_width))

        # Top spine
        self.fig.add_shape(
            type='line',
            x0=-self.paper_left_y_tick_len,
            x1=1,
            y0=self.ymax, y1=self.ymax,
            xref='paper', yref='y',
            line=dict(color=self.grid_color, width=self.spine_width * 2),
            name='top-spine'
        )

        # Right spine
        self.fig.add_shape(
            type="line",
            x0=self.xmax, x1=self.xmax,
            yref='y',
            y0=self.ymin,
            y1=self.ymax,
            line=dict(color=self.grid_color, width=self.grid_width * 2.5),
            layer='below',
            name='right-spine'
        )

    def custom_left_y_ticks(self):
        ticks = self.left_y_major_vals + self.left_y_minor_vals
        for tick in ticks:
            tick_width = self.spine_width if tick in self.left_y_major_vals else self.grid_width
            self.fig.add_shape(
                type="line",
                xref="paper",
                yref="y",
                x0=0, x1=-self.paper_left_y_tick_len,
                y0=tick, y1=tick,
                line=dict(color=self.grid_color, width=tick_width),
                name='left-y-tick'
            )

    def add_column_labels(self):
        """Add 'Counted' labels and blank lines below each column."""
        font_scale = 0.75

        # Offset values in pixels
        blank_line_pixel_offset = 35
        counted_label_pixel_offset = 55
        title_pixel_offset = 90

        # Convert to paper offsets
        blank_line_paper_offset = blank_line_pixel_offset / self.yaxis_px
        counted_label_paper_offset = counted_label_pixel_offset / self.yaxis_px
        title_paper_offset = title_pixel_offset / self.yaxis_px

        blank_line_pos = 0 - blank_line_paper_offset
        counted_label_pos = 0 - counted_label_paper_offset
        title_pos = 0 - title_paper_offset

        # Chart title
        self.fig.add_annotation(
            x=0.5,
            y=1.08,
            xref="paper",
            yref="paper",
            text="Frequency Collections Chart",
            showarrow=False,
            font=dict(size=self.font_size * 1.2, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='chart_title'
        )

        # Add column labels
        for col in range(self.num_columns):
            # Center position of each column
            center_x = col * self.points_per_column + self.points_per_column / 2

            # Blank line (underscore) for user to fill in
            self.fig.add_annotation(
                x=center_x,
                y=blank_line_pos,
                xref="x",
                yref="paper",
                text="_________",
                showarrow=False,
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name=f'blank-line-{col}'
            )

            # "Counted" label
            self.fig.add_annotation(
                x=center_x,
                y=counted_label_pos,
                xref="x",
                yref="paper",
                text="Counted",
                showarrow=False,
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name=f'counted-label-{col}'
            )

    def get_plot(self, to_json=False):
        # Grid traces must be added FIRST to render behind data traces
        self.minor_vertical_grid()
        self.major_vertical_grid()
        self.minor_horizontal_grid()
        self.major_horizontal_grid()

        # Add placeholder data traces (will appear in front of grid)
        self.add_placeholder_data()

        self.fig.update_layout(
            showlegend=False,
            xaxis=self.create_xaxis(),
            yaxis=self.create_left_yaxis(),
            plot_bgcolor='white',
            paper_bgcolor='white',
            width=self.width,
            height=self.height,
            autosize=False,
            dragmode='pan',
            annotations=[],
            margin=dict(l=self.margin_l, r=self.margin_r, t=self.margin_t, b=self.margin_b)
        )

        # Axes and ticks (remain as shapes)
        self.custom_left_y_ticks()
        self.add_custom_y_axis_labels()

        # Spines and labels (remain as shapes)
        self.add_fake_spines()
        self.add_column_labels()

        return self.fig.to_json() if to_json else self.fig


def preview(minute_type=True):
    """Show the chart in browser for testing."""
    plot = FrequencyCollectionsSCC(minute_type=minute_type)
    fig = plot.get_plot()
    fig.show()


if __name__ == '__main__':
    preview()

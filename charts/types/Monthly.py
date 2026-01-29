import math
import plotly.graph_objs as go
import pandas as pd


class MonthlySCC:
    def __init__(self, minute_type=True, xmax=120, chart_window_in_months=120, start_date=None):
        """
        Monthly SCC chart using Plotly.

        Args:
            minute_type: If True, shows count per minute with right y-axis for counting times.
                        If False, shows count per month without right y-axis.
            xmax: Maximum x-axis value (number of months). Default 120 (10 years).
            chart_window_in_months: The viewport width in months. Controls zoom level.
            start_date: Starting date for year labels. Defaults to today.
        """
        self.minute_type = minute_type
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
        self.xmax = xmax
        self.chart_window_in_months = chart_window_in_months
        self.margin_l = 110 if minute_type else 140
        self.margin_r = 120 if minute_type else 105
        self.margin_t = 130
        self.margin_b = 90

        self.deg = 34
        self.unit = 5  # months per doubling
        self.yaxis_px = self.height - (self.margin_t + self.margin_b)
        self.y_axis = math.log10(self.ymax) - math.log10(self.ymin)
        self.delta_y = math.log10(2 ** (self.chart_window_in_months / self.unit))
        self.delta_y_px = self.delta_y / self.y_axis * self.yaxis_px
        self.xaxis_px = self.delta_y_px / math.tan(math.radians(self.deg))
        self.width = self.xaxis_px + (self.margin_l + self.margin_r)

        px_right_n_left_y_tick_len = 6
        self.paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / self.xaxis_px

        # Date handling
        if start_date is None:
            self.start_date = pd.to_datetime('today').normalize()
        else:
            self.start_date = pd.to_datetime(start_date).normalize()

        # Calculate date positions
        self._calculate_date_positions()

        self.fig = go.Figure()

    def _calculate_date_positions(self):
        """Calculate all date-related positions and labels."""
        # Start from January of the previous year
        self.start_date_of_previous_year = self.start_date.replace(
            year=self.start_date.year - 1, month=1, day=1
        )

        # Generate month range
        self.all_dates = pd.date_range(
            self.start_date_of_previous_year,
            periods=self.xmax + 1,
            freq='MS',
            normalize=True
        )
        self.date_to_pos = {self.all_dates[i]: i for i in range(len(self.all_dates))}

        # Year labels (2-digit years for each year in the range)
        self.year_positions = list(range(0, self.xmax, 12))  # Every 12 months
        self.year_labels = []
        for pos in self.year_positions:
            if pos < len(self.all_dates):
                year = self.all_dates[pos].year
                self.year_labels.append(str(year)[-2:])  # Last 2 digits
            else:
                self.year_labels.append("")

    def create_xaxis(self):
        # Bottom x-axis: ticks at every month, labels every 12 months
        tick_vals = list(range(0, self.xmax + 1, 12))
        tick_labels = [str(pos) for pos in tick_vals]

        return dict(
            tickvals=tick_vals,
            ticktext=tick_labels,
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
            range=[-0.2, self.chart_window_in_months + 0.2],
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
                text="COUNT PER MINUTE" if self.minute_type else "COUNT PER MONTH",
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

    def create_right_yaxis(self):
        if self.minute_type:
            right_axis_color = self.style_color
        else:
            right_axis_color = 'rgba(0,0,0,0)'

        right_y_ticks_seconds = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 20, 60, 50, 100, 200, 500, 1000, 60 * 2, 60 * 4, 60 * 8, 60 * 16]
        right_y_ticks = [1 / m for m in right_y_ticks_seconds]
        right_y_ticks_log_mapped = [math.log10(t) for t in right_y_ticks]
        right_y_labels = ['10" sec', '15"', '20"', '30"', "1' min", "2'", "5'", "10'", "20'", "            – 1 h", "50'", "100'", "200'", "500'", "1000'",
                         "            – 2 h",
                         "            – 4 h",
                         "            – 8 h",
                         "            – 16 h"]

        ann_offset = 1 + (30 / self.xaxis_px)
        self.fig.add_annotation(
            x=ann_offset,
            y=0.95,
            xref="paper",
            yref="paper",
            text="COUNTING TIMES",
            showarrow=False,
            font=dict(size=self.font_size * 0.7, family=self.font_family, color=right_axis_color, weight='bold'),
            align="center",
            textangle=-90,
        )

        return dict(
            showline=False,
            tickfont=dict(size=self.font_size * 0.6, family=self.font_family, color=right_axis_color, weight=self.font_weight),
            ticklabelposition='outside',
            ticklabelstandoff=10,
            showgrid=False,
            zeroline=False,
            side='right',
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            overlaying='y',
            tickmode='array',
            tickvals=right_y_ticks_log_mapped,
            ticktext=right_y_labels,
            fixedrange=True
        )

    def add_placeholder_data(self):
        x_placeholder = []
        y_placeholder = []
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Left Axis Trace"))
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Right Axis Trace", yaxis='y2', visible=False))

    def major_vertical_grid(self):
        """Major vertical grid lines every 6 months - trace-based for pan performance."""
        scaling_factor = 2.5
        x_vals = []
        y_vals = []
        for i in range(6, self.xmax, 6):
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
        """Minor vertical grid lines at each month - trace-based for pan performance."""
        x_vals = []
        y_vals = []
        for i in range(0, self.xmax + 1):
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
        position = -0.03
        # Bottom spine
        self.fig.add_shape(
            type="line",
            x0=self.xmin, x1=self.xmax, yref='paper', y0=position, y1=position,
            line=dict(color=self.grid_color, width=self.spine_width))

        # Bottom tick marks - every 12 months (yearly)
        for i in range(0, self.xmax + 12, 12):
            if i <= self.xmax:
                self.fig.add_shape(
                    type="line",
                    x0=i, x1=i,
                    yref='paper',
                    y0=position + 0.01, y1=position - 0.01,
                    line=dict(color=self.grid_color, width=self.spine_width),
                    name='x-tick'
                )

        # Top spine
        self.fig.add_shape(
            type='line',
            x0=-self.paper_right_n_left_y_tick_len,
            x1=1,
            y0=self.ymax, y1=self.ymax,
            xref='paper', yref='y',
            line=dict(color=self.grid_color, width=self.spine_width * 2),
            name='top-spine'
        )

        # Top tick marks - at year boundaries (every 12 months)
        tick_height_paper = 45 / self.yaxis_px
        for i in range(0, self.xmax + 12, 12):
            if i <= self.xmax:
                self.fig.add_shape(
                    type="line",
                    x0=i, x1=i,
                    yref='paper',
                    y0=1 + tick_height_paper, y1=1,
                    line=dict(color=self.grid_color, width=self.spine_width),
                    name='top-x-tick'
                )

    def custom_left_y_ticks(self):
        ticks = self.left_y_major_vals + self.left_y_minor_vals
        for tick in ticks:
            tick_width = self.spine_width if tick in self.left_y_major_vals else self.grid_width
            self.fig.add_shape(
                type="line",
                xref="paper",
                yref="y",
                x0=0, x1=-self.paper_right_n_left_y_tick_len,
                y0=tick, y1=tick,
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
                    xref="paper",
                    yref="y",
                    x0=1, x1=1 + self.paper_right_n_left_y_tick_len,
                    y0=1 / tick, y1=1 / tick,
                    line=dict(color=self.grid_color, width=tick_width),
                    name='right-y-tick'
                )

    def add_date_lines(self):
        font_scale = 0.8
        year_label_scale = 0.85

        # Offset values in pixels
        year_label_pixel_offset = 30
        year_count_pixel_offset = 58
        top_x_title_pixel_offset = 100
        bottom_x_title_pixel_offset = 75

        # Convert pixel offsets to 'paper' offsets
        year_label_paper_offset = year_label_pixel_offset / self.yaxis_px
        year_count_paper_offset = year_count_pixel_offset / self.yaxis_px
        top_x_title_paper_offset = top_x_title_pixel_offset / self.yaxis_px
        bottom_x_title_paper_offset = bottom_x_title_pixel_offset / self.yaxis_px

        # Get positions as 'paper' coordinates
        year_label_pos = 1 + year_label_paper_offset
        year_count_pos = 1 + year_count_paper_offset
        top_x_title_pos = 1 + top_x_title_paper_offset
        bottom_x_title_pos = 0 - bottom_x_title_paper_offset

        # Bottom axis title
        self.fig.add_annotation(
            x=0.5,
            y=bottom_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR MONTHS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='bottom_x_title'
        )

        # Top axis title
        self.fig.add_annotation(
            x=0.5,
            y=top_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR YEARS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='top_x_title'
        )

        # Year count labels (0, 1, 2, 3...) - at year boundaries
        for idx, pos in enumerate(range(0, self.xmax + 12, 12)):
            if pos > self.xmax:
                break
            self.fig.add_annotation(
                x=pos,
                y=year_count_pos,
                xref="x",
                yref="paper",
                text=str(idx),
                showarrow=False,
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name='year-count'
            )

        # Year labels (25, 26, 27...) - centered in each year block (at pos + 6)
        for idx, pos in enumerate(self.year_positions):
            center_pos = pos + 6  # Center of 12-month block
            if center_pos > self.xmax:
                break

            if idx < len(self.year_labels):
                label_text = self.year_labels[idx]
            else:
                label_text = f"INSERTDATE{idx}"

            self.fig.add_annotation(
                x=center_pos,
                y=year_label_pos,
                xref="x",
                yref="paper",
                text=label_text,
                showarrow=False,
                font=dict(size=self.font_size * year_label_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name=f'year-label-{idx}'
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
            yaxis2=self.create_right_yaxis(),
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
        self.custom_right_y_ticks()
        self.add_custom_y_axis_labels()

        # Other elements (remain as shapes)
        self.add_fake_spines()
        self.left_n_right_fake_spines()
        self.add_date_lines()

        return self.fig.to_json() if to_json else self.fig


def preview(minute_type=True):
    """Show the chart in browser for testing."""
    plot = MonthlySCC(minute_type=minute_type)
    fig = plot.get_plot()
    fig.show()


if __name__ == '__main__':
    preview()

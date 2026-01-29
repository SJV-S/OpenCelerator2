import plotly.graph_objs as go
import numpy as np
import pandas as pd


class TimingSCC:
    def __init__(self, xmax=100, chart_window_in_trials=100):
        self.xmin = 0
        self.xmax = xmax
        self.chart_window_in_trials = chart_window_in_trials
        #self.width = 900
        self.height = 675  # Layout height (arbitrary). Width will be calculated.
        self.style_color = '#05c3de'  # Color for spines, ticks, and labels
        self.grid_color = '#6ad1e3'  # Color for grid lines
        self.font_family = 'Tahoma, DejaVu Sans, Verdana, sans-serif'
        self.font_size = 22
        self.font_weight = 'bold'
        self.grid_width = 1
        self.spine_width = 2
        self.ymin = 0.17  # Minimum y-axis value
        self.ymax = 700  # Maximum y-axis value

        # Calculate layout width from layout height.
        (margin_l, margin_r, margin_t, margin_b) = (100, 100, 180, 70) # xy-axis margins | values from the line "Keep the margins fixed"
        deg = 34  # desired angle of doubling in degrees
        unit = 10  # number of timings per doubling
        lessons = 10  # number of lessons (columns)
        tpl = 10  # number of timings per lesson
        yaxis_px = self.height - (margin_t + margin_b)  # y-axis length in px
        double_y_px = np.log10(2) / np.log10(self.ymax / self.ymin) * yaxis_px  # doubling along y-axis in px
        double_x_px = double_y_px / np.tan(np.radians(deg))  # doubling along x-axis in px
        xaxis_px = double_x_px / unit * tpl * (self.chart_window_in_trials / 10)  # Use chart_window_in_trials for width calculation
        self.width = xaxis_px + (margin_l + margin_r)  # layout height

        # Lesson line positions
        self.very_top_line = 1.18
        self.top_line = 1.12
        self.middle_line = 1.06
        self.bottom_line = 1

        # Storage for all lesson data
        self.lesson_data = {}
        for i in range(1, 11):
            self.lesson_data[i] = {'interval': '', 'date_str': '', 'teacher': '', 'y_corr': [], 'y_err': [], 'target': [], 'pinpoint': ''}

        # Lessons and their min and max (inclusive) x-values
        self.lesson_num_to_x_range = {
                        1: (1, 9),
                        2: (11, 19),
                        3: (21, 29),
                        4: (31, 39),
                        5: (41, 49),
                        6: (51, 59),
                        7: (61, 69),
                        8: (71, 79),
                        9: (81, 89),
                        10: (91, 99)
        }

        self.fig = go.Figure()

    def create_xaxis(self):
        return dict(
            tickvals=[1, 10, 90, 100],  # Ticks only at 1, 10, 90, and 100
            ticktext=["1", "10", "1", "10"],  # Corresponding labels
            tickmode='array',  # Control tick positions manually
            tick0=0,
            ticklabelstandoff=15,  # Push the x-axis tick labels further down
            showline=False,  # Hide the default x-axis spine
            tickfont=dict(
                size=self.font_size,
                family=self.font_family,
                color=self.style_color,
                weight=self.font_weight
            ),
            title=dict(
                text="SUCCESSIVE TIMINGS",  # Applying the title
                standoff=0,
                font=dict(
                    size=self.font_size,
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                )
            ),
            showgrid=False,  # Disable grid lines
            zeroline=False,
            range=[-0.2, self.chart_window_in_trials + 0.2],  # Fixed viewport size
            fixedrange=False,
        )

    def create_left_yaxis(self):
        # Define the left y-axis tick positions
        left_y_ticks = [10 ** e for e in [np.log10(i) for i in [1, 10, 100]]]

        # Dynamically calculate the smaller font size (half of the original font size)
        small_font_size = self.font_size * 0.7

        return dict(
            showline=False,  # Hide the left y-axis spine
            tickvals=left_y_ticks,  # Set y-axis tick values
            tickfont=dict(size=self.font_size, family=self.font_family, color=self.style_color,
                          weight=self.font_weight),
            ticklabelposition='outside',  # Keep labels outside of the series
            ticklabelstandoff=10,  # Push the y-axis tick labels further left
            title=dict(
                text="COUNT PER MINUTE",
                standoff=1,
                font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight)
            ),
            showgrid=False,  # Disable grid lines
            zeroline=False,
            type='log',
            range=[np.log10(self.ymin), np.log10(self.ymax)],
            fixedrange=True
        )

    def add_custom_y_axis_labels(self):
        custom_ticks = [0.2, 0.5, 5, 50, 500]
        font_size_scale = 0.7
        x_shift = -5  # Adjust this value to fine-tune horizontal spacing

        # Loop through each tick value
        for tick in custom_ticks:
            # Convert the tick value to its log10 equivalent for correct placement on a log scale
            log_tick = np.log10(tick)

            self.fig.add_annotation(
                xref="paper",  # Position based on the 'paper' space, so x is static
                yref="y",  # Reference the y-axis for the y-values
                x=-0.004,  # Position slightly left of the default y-axis labels
                y=log_tick,  # Y value for the annotation, converted to log scale
                text=f"{tick}",  # The custom y-axis value to display
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
            )

    def create_right_yaxis(self):
        right_y_ticks_seconds = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5]
        right_y_ticks = [1 / m for m in right_y_ticks_seconds]
        right_y_labels = ['10 sec', '15 sec', '20 sec', '30 sec', "1 min", "2 min", "5 min"]

        right_y_ticks_log_mapped = np.log10(right_y_ticks)

        return dict(
            showline=False,  # Hide the right y-axis spine
            tickfont=dict(size=self.font_size * 0.7, family=self.font_family, color=self.style_color, weight=self.font_weight),
            ticklabelposition='outside',  # Keep labels outside of the series
            ticklabelstandoff=10,  # Increase this value to push the y-axis tick labels further to the right
            showgrid=False,  # Disable grid lines for the right y-axis
            zeroline=False,
            side='right',  # Position the y-axis on the right
            range=[np.log10(self.ymin), np.log10(self.ymax)],
            overlaying='y',  # Overlay on the same series
            tickmode='array',  # Explicitly specify tick mode to use array of tickvals and ticktext
            tickvals=right_y_ticks_log_mapped,  # Place the right y-axis labels based on the mapped log values
            ticktext=right_y_labels,  # Labels for the right y-axis (time)
            fixedrange=True
        )

    def add_placeholder_data(self):
        # Apparently needed, otherwise the graph gets distorted
        x_placeholder = []
        y_placeholder = []
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Left Axis Trace"))
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Right Axis Trace", yaxis='y2', visible=False))

    def draw_long_ticks(self):
        scaling_factor = 2.5
        tick_len = 1.25
        # Define the left y-axis limits
        for i in range(0, 110, 10):
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='y',  # y0 is now relative to the y-axis (left y-axis)
                y0=self.ymin,  # Start from the minimum value of the left y-axis
                y1=self.ymax,  # End at the maximum value of the left y-axis
                line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
                layer='below'
            )

            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='paper',  # Use the 'paper' coordinate system to move outside the graph area
                y0=1,  # Start at the top of the graph
                y1=tick_len,  # Extend above the top of the graph
                line=dict(color=self.grid_color, width=self.grid_width * scaling_factor)
            )

    def draw_vertical_lines(self):
        for i in range(0, 101):
            if i % 10 == 0:  # Skip every 10th value (including 0 and 100)
                continue
            self.fig.add_shape(
                type="line",
                x0=i, x1=i, yref='paper', y0=0, y1=1,  # Draw vertical lines across the entire series height
                line=dict(color=self.grid_color, width=self.grid_width * 0.5),  # Customize the appearance of the vertical lines
                layer='below'
            )

    def draw_horizontal_lines(self):
        major_powers = [0.5, 5, 50, 1, 5, 10, 100, 500]
        minor_powers = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 6, 7, 8, 9, 20, 30, 40, 60, 70, 80, 90, 200, 300, 400, 600]
        scaling_factor = 1.5
        # Add major grid lines (thicker lines)
        for power in major_powers:
            self.fig.add_shape(
                type="line",
                x0=0, x1=1,  # Span the whole width of the series
                y0=power, y1=power,  # Position the horizontal line at 'power' on the y-axis
                xref="paper", yref="y",  # Use relative x-coordinates and actual y-axis values
                line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
                layer='below')

        # Add minor grid lines (thinner lines)
        for power in minor_powers:
            self.fig.add_shape(
                type="line",
                x0=0, x1=1,  # Span the whole width of the series
                y0=power, y1=power,  # Position the horizontal line at 'power' on the y-axis
                xref="paper", yref="y",
                line=dict(color=self.grid_color, width=self.grid_width * 0.5),
                layer='below')

    def add_fake_spines(self):
        position = -0.03  # Move the line down vertically within the series
        # Bottom spine
        self.fig.add_shape(
            type="line",
            x0=0, x1=100, yref='paper', y0=position, y1=position,
            line=dict(color=self.grid_color, width=self.spine_width))

        # Add tick marks on every 10th x value along the bottom spine
        for i in range(0, 101, 10):
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='paper',  # Use paper ref to position relative to the bottom spine
                y0=position + 0.015, y1=position - 0.015,  # Small vertical line for the tick mark
                line=dict(color=self.grid_color, width=self.spine_width)
            )

        # Top spine
        self.fig.add_shape(type='line',
                           x0=0, x1=1,
                           y0=700, y1=700,
                           xref='paper', yref='y',
                           line=dict(color=self.grid_color, width=self.spine_width * 2))

    def add_lesson_lines(self):
        for idx, start in enumerate(range(1, 101, 10)):
            end = start + 8  # The end is always 8 units after the start

            # Add the first line
            self.fig.add_shape(
                type="line",
                x0=start, x1=end,  # Start and end of the horizontal line
                yref='paper',  # Use the 'paper' coordinate system to place the line outside series area
                y0=self.middle_line, y1=self.middle_line,  # Vertical position slightly above the series (outside)
                line=dict(color=self.grid_color, width=self.spine_width)  # Customize line appearance
            )

            # Add the second line
            self.fig.add_shape(
                type="line",
                x0=start, x1=end,  # Start and end of the horizontal line
                yref='paper',  # Use the 'paper' coordinate system to place the line outside series area
                y0=self.top_line, y1=self.top_line,  # Vertical position slightly above the series (outside)
                line=dict(color=self.grid_color, width=self.spine_width)  # Customize line appearance
            )

            # Add the third line
            self.fig.add_shape(
                type="line",
                x0=start, x1=end,  # Start and end of the horizontal line
                yref='paper',  # Use the 'paper' coordinate system to place the line outside series area
                y0=self.very_top_line, y1=self.very_top_line,  # Vertical position slightly above the series (outside)
                line=dict(color=self.grid_color, width=self.spine_width)  # Customize line appearance
            )

    def add_lesson(self, lesson_num, pinpoint, teachers):
        start, end = self.lesson_num_to_x_range[lesson_num]
        date_today = pd.to_datetime('today').strftime('%d-%b')

        # Stringfy if list
        if isinstance(teachers, list):
            teachers = "\n".join(teachers)

        # Add data to dictionary
        self.lesson_data[lesson_num]['pinpoint'] = pinpoint
        self.lesson_data[lesson_num]['teacher'] = teachers
        self.lesson_data[lesson_num]['date_str'] = date_today

        for position, text in zip([self.top_line, self.middle_line, self.bottom_line],
                                  [teachers, date_today, pinpoint]):

            self.fig.add_annotation(
                x=(start + end) / 2,  # Center the text along the line
                y=position,  # Position the text slightly above the line
                xref='x', yref='paper',  # Reference the x-axis and paper (yref)
                text=text,
                showarrow=False,  # Hide the arrow
                font=dict(size=self.font_size * 0.5, color='black'),  # Customize font appearance
                align="center",  # Center the text
                yanchor="bottom"  # Anchor the text at the bottom
            )

    def plot_lessons(self):
        # Assumes data has been separately added to lesson_data dictionary

        # Remove all data except the placeholder data
        self.fig.data = [trace for trace in self.fig.data if trace.name in ["Left Axis Trace", "Right Axis Trace"]]

        # Plot lessons for all data
        for lesson_num in range(1, 11):
            start, end = self.lesson_num_to_x_range[lesson_num]
            lesson = self.lesson_data[lesson_num]

            # Plot if there's data for that lesson
            if lesson['y_corr'] or lesson['y_err']:

                # Get corresponding x values
                x_corr = np.arange(start, len(lesson['y_corr']) + start)
                x_err = np.arange(start, len(lesson['y_err']) + start)

                # Add corrects trace
                self.fig.add_trace(go.Scatter(
                    x=x_corr,
                    y=lesson['y_corr'],
                    mode='lines+markers',
                    line=dict(color='black', width=0.5),
                    marker=dict(symbol='circle', size=6),
                ))

                # Add errors trace
                self.fig.add_trace(go.Scatter(
                    x=x_err,
                    y=lesson['y_err'],
                    mode='lines+markers',
                    line=dict(color='red', width=0.5),
                    marker=dict(symbol='x', size=7),
                ))

    def custom_left_y_ticks(self):
        ticks = [0.2, 0.5, 1, 5, 10, 50, 100, 500]
        tick_length = 0.01
        for tick in ticks:
            self.fig.add_shape(
                type="line",
                xref="paper",  # Reference the 'paper' coordinates for x-axis
                yref="y",      # Reference the actual y-axis values
                x0=0, x1=-tick_length,  # Extend the tick outward from the y-axis
                y0=tick, y1=tick,       # Position the tick at the y-axis value
                line=dict(color=self.grid_color, width=self.spine_width)
            )

    def custom_right_y_ticks(self):
        ticks = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5]  # Seconds and minutes as per your y-axis scaling
        tick_length = 0.01
        for tick in ticks:
            tick_width = self.spine_width if tick in [1, 2, 5] else self.grid_width
            self.fig.add_shape(
                type="line",
                xref="paper",  # Reference the 'paper' coordinates for x-axis
                yref="y",      # Reference the actual y-axis values
                x0=1, x1=1 + tick_length,  # Extend the tick outward from the right y-axis
                y0=1/tick, y1=1/tick,      # Position the tick at the corresponding right y-axis value
                line=dict(color=self.grid_color, width=tick_width)
            )

    def get_plot(self, to_json=False, to_html=False):
        # Add placeholder data (needed for plotly)
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
            margin=dict(l=100, r=100, t=180, b=70)  # Keep the margins fixed
        )

        # # Add a title using annotations instead of the title attribute
        # self.fig.add_annotation(
        #     text="",  # Placeholder
        #     xref='paper', yref='paper',
        #     x=0.5, y=1.35,  # Position the title horizontally centered and above the series
        #     showarrow=False,
        #     font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight),
        #     xanchor='center',  # Center the text horizontally
        #     yanchor='top'  # Ensure it's aligned above the series
        # )


        # Add custom elements
        self.draw_long_ticks()
        self.draw_vertical_lines()
        self.draw_horizontal_lines()
        self.add_fake_spines()
        self.add_lesson_lines()
        self.custom_left_y_ticks()
        self.add_custom_y_axis_labels()
        self.custom_right_y_ticks()

        return self.fig.to_json() if to_json else self.fig


def main():
    plot = TimingSCC(chart_window_in_trials=20)
    fig = plot.get_plot()
    fig.show()


if __name__ == "__main__":
    main()

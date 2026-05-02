const Highcharts = {
  chart: jest.fn().mockReturnValue({ destroy: jest.fn() }),
};

export default Highcharts;

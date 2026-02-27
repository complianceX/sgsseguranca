import { Controller, Get, Query } from '@nestjs/common';

@Controller('math')
export class MathController {
  @Get('sum')
  sum(@Query('a') a: string, @Query('b') b: string) {
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;

    return {
      a: numA,
      b: numB,
      operation: `${numA} + ${numB}`,
      result: numA + numB,
    };
  }

  @Get('subtract')
  subtract(@Query('a') a: string, @Query('b') b: string) {
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;

    return {
      operation: 'subtract',
      a: numA,
      b: numB,
      result: numA - numB,
    };
  }

  @Get('multiply')
  multiply(@Query('a') a: string, @Query('b') b: string) {
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;

    return {
      operation: 'multiply',
      a: numA,
      b: numB,
      result: numA * numB,
    };
  }

  @Get('divide')
  divide(@Query('a') a: string, @Query('b') b: string) {
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;

    if (numB === 0) {
      return {
        operation: 'divide',
        a: numA,
        b: numB,
        error: 'Cannot divide by zero',
      };
    }

    return {
      operation: 'divide',
      a: numA,
      b: numB,
      result: numA / numB,
    };
  }
}
